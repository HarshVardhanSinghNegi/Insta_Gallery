import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { compressImage } from './utils/compressImage'
import AdSlot from './AdSlot'

const BUCKET = 'media'
const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="%23e8e8e8"/><circle cx="75" cy="58" r="28" fill="%23bbb"/><ellipse cx="75" cy="140" rx="48" ry="38" fill="%23bbb"/></svg>`
  )

// A random per-browser ID so anonymous viewers can like/dislike without
// an account, while still only getting one vote per post each.
function getVoterId() {
  let id = localStorage.getItem('gallery_voter_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('gallery_voter_id', id)
  }
  return id
}
const VOTER_ID = getVoterId()

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState({
    display_name: 'Your Name',
    bio: 'Photographer · Storyteller · Add your bio here',
    avatar_url: '',
  })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all | image | video
  const [sortMode, setSortMode] = useState('none') // none | liked | disliked

  const [reactionCounts, setReactionCounts] = useState({}) // { [mediaId]: { likes, dislikes } }
  const [myVotes, setMyVotes] = useState({}) // { [mediaId]: 'like' | 'dislike' }

  const [dark, setDark] = useState(() => localStorage.getItem('gallery_dark') === '1')

  const [showLogin, setShowLogin] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [activeIndex, setActiveIndex] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    loadAll()
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.body.classList.toggle('dark', dark)
    localStorage.setItem('gallery_dark', dark ? '1' : '0')
  }, [dark])

  async function loadAll() {
    setLoading(true)
    const [{ data: mediaData }, { data: profileData }] = await Promise.all([
      supabase.from('media').select('*').order('created_at', { ascending: false }),
      supabase.from('profile').select('*').limit(1).maybeSingle(),
    ])
    setItems(mediaData || [])
    if (profileData) setProfile(profileData)
    await loadReactions()
    setLoading(false)
  }

  async function loadReactions() {
    const { data } = await supabase.from('reactions').select('media_id, type, voter_id')
    const counts = {}
    const mine = {}
    ;(data || []).forEach((r) => {
      if (!counts[r.media_id]) counts[r.media_id] = { likes: 0, dislikes: 0 }
      if (r.type === 'like') counts[r.media_id].likes++
      else counts[r.media_id].dislikes++
      if (r.voter_id === VOTER_ID) mine[r.media_id] = r.type
    })
    setReactionCounts(counts)
    setMyVotes(mine)
  }

  async function vote(mediaId, type) {
    const current = myVotes[mediaId]
    // Optimistic local update so it feels instant
    setMyVotes((prev) => {
      const next = { ...prev }
      if (current === type) delete next[mediaId]
      else next[mediaId] = type
      return next
    })
    setReactionCounts((prev) => {
      const next = { ...prev }
      const c = { ...(next[mediaId] || { likes: 0, dislikes: 0 }) }
      if (current === 'like') c.likes = Math.max(0, c.likes - 1)
      if (current === 'dislike') c.dislikes = Math.max(0, c.dislikes - 1)
      if (current !== type) {
        if (type === 'like') c.likes++
        else c.dislikes++
      }
      next[mediaId] = c
      return next
    })

    if (current === type) {
      await supabase.from('reactions').delete().eq('media_id', mediaId).eq('voter_id', VOTER_ID)
    } else {
      await supabase
        .from('reactions')
        .upsert({ media_id: mediaId, voter_id: VOTER_ID, type }, { onConflict: 'media_id,voter_id' })
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} post(s)? This can't be undone.`)) return
    const toDelete = items.filter((i) => selectedIds.has(i.id))
    const paths = toDelete.map((i) => i.storage_path)
    await supabase.storage.from(BUCKET).remove(paths)
    await supabase.from('media').delete().in('id', Array.from(selectedIds))
    setSelectedIds(new Set())
    setSelectMode(false)
    loadAll()
  }

  const isOwner = !!session
  const photoCount = items.filter((i) => i.type === 'image').length
  const videoCount = items.filter((i) => i.type === 'video').length

  let visibleItems = filter === 'all' ? items : items.filter((i) => i.type === filter)
  if (sortMode === 'liked') {
    visibleItems = [...visibleItems].sort(
      (a, b) => (reactionCounts[b.id]?.likes || 0) - (reactionCounts[a.id]?.likes || 0)
    )
  } else if (sortMode === 'disliked') {
    visibleItems = [...visibleItems].sort(
      (a, b) => (reactionCounts[b.id]?.dislikes || 0) - (reactionCounts[a.id]?.dislikes || 0)
    )
  }

  return (
    <div className="page">
      <AdRail side="left" />

      <main className="content">
        <header className="profile-header">
          <img
            className="avatar"
            src={profile.avatar_url || DEFAULT_AVATAR}
            alt={profile.display_name}
          />
          <div className="profile-info">
            <div className="profile-top">
              <h1>{profile.display_name}</h1>
              <div className="profile-actions">
                <button
                  className="icon-btn"
                  onClick={() => setDark((d) => !d)}
                  aria-label="Toggle dark mode"
                  title="Toggle dark mode"
                >
                  {dark ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                  )}
                </button>

                {isOwner && !selectMode && (
                  <>
                    <button className="btn ghost small" onClick={() => setShowEditProfile(true)}>
                      Edit profile
                    </button>
                    <button className="btn ghost small" onClick={() => setSelectMode(true)}>
                      Select
                    </button>
                    <button className="btn primary small" onClick={() => setShowAdd(true)}>
                      + New post
                    </button>
                  </>
                )}
                {isOwner && selectMode && (
                  <>
                    <button
                      className="btn ghost small"
                      onClick={() => {
                        setSelectMode(false)
                        setSelectedIds(new Set())
                      }}
                    >
                      Cancel
                    </button>
                    <button className="btn danger small" disabled={selectedIds.size === 0} onClick={bulkDelete}>
                      Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                    </button>
                  </>
                )}
                <button
                  className="btn ghost small"
                  onClick={() => (isOwner ? supabase.auth.signOut() : setShowLogin(true))}
                >
                  {isOwner ? 'Sign out' : 'Sign in'}
                </button>
              </div>
            </div>
            <div className="stats">
              <span><strong>{items.length}</strong> posts</span>
              <span><strong>{photoCount}</strong> photos</span>
              <span><strong>{videoCount}</strong> videos</span>
            </div>
            <p className="bio">{profile.bio}</p>
          </div>
        </header>

        <div className="tabs">
          <button className={filter === 'all' ? 'tab active' : 'tab'} onClick={() => setFilter('all')}>
            All
          </button>
          <button className={filter === 'image' ? 'tab active' : 'tab'} onClick={() => setFilter('image')}>
            Photos
          </button>
          <button className={filter === 'video' ? 'tab active' : 'tab'} onClick={() => setFilter('video')}>
            Videos
          </button>
        </div>

        <div className="sort-row">
          <span className="sort-label">Sort:</span>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={sortMode === 'liked'}
              onChange={() => setSortMode(sortMode === 'liked' ? 'none' : 'liked')}
            />
            Most liked
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={sortMode === 'disliked'}
              onChange={() => setSortMode(sortMode === 'disliked' ? 'none' : 'disliked')}
            />
            Most disliked
          </label>
        </div>

        {loading && <div className="loading">Loading…</div>}

        {!loading && visibleItems.length === 0 && (
          <div className="empty">
            <div className="empty-icon">◇</div>
            <p>{isOwner ? 'No posts yet — share your first one.' : 'No posts yet.'}</p>
          </div>
        )}

        {!loading && visibleItems.length > 0 && (
          <div className="post-grid">
            {visibleItems.map((item, i) => (
              <PostThumb
                key={item.id}
                item={item}
                selectMode={selectMode}
                selected={selectedIds.has(item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
                onOpen={() => setActiveIndex(i)}
              />
            ))}
          </div>
        )}

        <footer className="mobile-ad">
          <AdSlot label="Ad" />
        </footer>
      </main>

      <AdRail side="right" />

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            loadAll()
          }}
        />
      )}
      {showEditProfile && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditProfile(false)}
          onSaved={(p) => {
            setProfile(p)
            setShowEditProfile(false)
          }}
        />
      )}
      {activeIndex !== null && (
        <Lightbox
          items={visibleItems}
          index={activeIndex}
          isOwner={isOwner}
          counts={reactionCounts}
          myVotes={myVotes}
          onVote={vote}
          onClose={() => setActiveIndex(null)}
          onNavigate={setActiveIndex}
          onDeleted={() => {
            setActiveIndex(null)
            loadAll()
          }}
        />
      )}
    </div>
  )
}

function AdRail({ side }) {
  return (
    <aside className={`ad-rail ${side}`}>
      <div className="ad-rail-inner">
        <AdSlot label="Ad" />
      </div>
    </aside>
  )
}

function PostThumb({ item, onOpen, selectMode, selected, onToggleSelect }) {
  function handleClick() {
    if (selectMode) onToggleSelect()
    else onOpen()
  }
  return (
    <div
      className={`post-thumb ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {item.type === 'video' ? (
        <video src={item.url} muted playsInline />
      ) : (
        <img src={item.url} alt={item.title || 'Post'} loading="lazy" />
      )}
      {item.type === 'video' && !selectMode && (
        <span className="video-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
      {selectMode && (
        <span className={`thumb-checkbox ${selected ? 'checked' : ''}`}>
          {selected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
          )}
        </span>
      )}
    </div>
  )
}

function LoginModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else onClose()
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>×</button>
        <h2>Sign in</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditProfileModal({ profile, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function handleAvatar(f) {
    if (!f) return
    const compressed = await compressImage(f)
    setAvatarFile(compressed)
    setAvatarPreview(URL.createObjectURL(compressed))
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      let avatarUrl = profile.avatar_url
      if (avatarFile) {
        const path = `avatars/${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, avatarFile, { upsert: true })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
        avatarUrl = pub.publicUrl
      }

      const payload = {
        id: profile.id || 1,
        display_name: displayName.trim() || 'Your Name',
        bio: bio.trim(),
        avatar_url: avatarUrl,
      }
      const { data, error: dbErr } = await supabase
        .from('profile')
        .upsert(payload)
        .select()
        .single()
      if (dbErr) throw dbErr

      onSaved(data)
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>×</button>
        <h2>Edit profile</h2>

        <div className="field avatar-field">
          <img src={avatarPreview || DEFAULT_AVATAR} alt="Avatar preview" className="avatar-preview" />
          <button className="btn ghost small" onClick={() => inputRef.current.click()}>
            Change photo
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleAvatar(e.target.files[0])}
          />
        </div>

        <div className="field">
          <label>Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Bio</label>
          <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddModal({ onClose, onSaved }) {
  const [queue, setQueue] = useState([]) // [{ id, file, preview, type, title }]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const inputRef = useRef(null)

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    for (const f of files) {
      const isVideo = f.type.startsWith('video/')
      const isImage = f.type.startsWith('image/')
      if (!isVideo && !isImage) continue

      const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8)

      if (isImage) {
        const compressed = await compressImage(f)
        setQueue((q) => [
          ...q,
          { id, file: compressed, preview: URL.createObjectURL(compressed), type: 'image', title: '' },
        ])
      } else {
        setQueue((q) => [
          ...q,
          { id, file: f, preview: URL.createObjectURL(f), type: 'video', title: '' },
        ])
      }
    }
  }

  function removeItem(id) {
    setQueue((q) => q.filter((item) => item.id !== id))
  }

  function updateCaption(id, title) {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, title } : item)))
  }

  async function save() {
    if (queue.length === 0) return
    setBusy(true)
    setError('')
    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i]
        setProgress(`Uploading ${i + 1} of ${queue.length}…`)

        const ext = item.type === 'video' ? item.file.name.split('.').pop() : 'jpg'
        const path = `media/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, item.file)
        if (upErr) throw upErr

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

        const { error: dbErr } = await supabase.from('media').insert({
          title: item.title.trim(),
          type: item.type,
          url: pub.publicUrl,
          storage_path: path,
        })
        if (dbErr) throw dbErr
      }

      onSaved()
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>×</button>
        <h2>New post{queue.length > 1 ? `s (${queue.length})` : ''}</h2>

        <div className="field">
          <div
            className="dropzone"
            onClick={() => inputRef.current.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFiles(e.dataTransfer.files)
            }}
          >
            <span>Click to choose photos or videos, or drag them here</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {queue.length > 0 && (
          <div className="queue-list">
            {queue.map((item) => (
              <div className="queue-item" key={item.id}>
                <div className="queue-thumb">
                  {item.type === 'video' ? (
                    <video src={item.preview} muted />
                  ) : (
                    <img src={item.preview} alt="Preview" />
                  )}
                </div>
                <input
                  type="text"
                  className="queue-caption"
                  placeholder="Write a caption…"
                  value={item.title}
                  onChange={(e) => updateCaption(item.id, e.target.value)}
                />
                <button className="queue-remove" onClick={() => removeItem(item.id)} aria-label="Remove">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {progress && <p className="progress-text">{progress}</p>}
        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={queue.length === 0 || busy} onClick={save}>
            {busy ? 'Posting…' : queue.length > 1 ? `Share ${queue.length} posts` : 'Share'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Lightbox({ items, index, isOwner, counts, myVotes, onVote, onClose, onNavigate, onDeleted }) {
  const item = items[index]
  const touchStartX = useRef(null)

  const goPrev = () => index > 0 && onNavigate(index - 1)
  const goNext = () => index < items.length - 1 && onNavigate(index + 1)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, items.length])

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(deltaX) > 50) {
      if (deltaX > 0) goPrev()
      else goNext()
    }
    touchStartX.current = null
  }

  if (!item) return null

  const itemCounts = counts[item.id] || { likes: 0, dislikes: 0 }
  const myVote = myVotes[item.id]

  async function remove() {
    if (!confirm('Delete this post?')) return
    await supabase.storage.from(BUCKET).remove([item.storage_path])
    await supabase.from('media').delete().eq('id', item.id)
    onDeleted()
  }

  return (
    <div className="lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button className="lightbox-close" onClick={onClose}>Close ✕</button>

      {index > 0 && (
        <button className="lightbox-nav prev" onClick={goPrev} aria-label="Previous">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M15.5 19L8.5 12l7-7" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}
      {index < items.length - 1 && (
        <button className="lightbox-nav next" onClick={goNext} aria-label="Next">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M8.5 5l7 7-7 7" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}

      <div className="lightbox-inner" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {item.type === 'video' ? (
          <video src={item.url} controls autoPlay key={item.id} />
        ) : (
          <img src={item.url} alt={item.title || 'Post'} key={item.id} />
        )}
        {item.title && <p className="lightbox-caption">{item.title}</p>}

        <div className="reaction-row">
          <button
            className={`reaction-btn ${myVote === 'like' ? 'active-like' : ''}`}
            onClick={() => onVote(item.id, 'like')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={myVote === 'like' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M7 22V11M2 13v7a2 2 0 002 2h13a2 2 0 002-1.7l1.2-8A2 2 0 0018.2 10H14V5a2 2 0 00-2-2 1 1 0 00-1 1v2a5 5 0 01-1.5 3.5L7 12" /></svg>
            <span>{itemCounts.likes}</span>
          </button>
          <button
            className={`reaction-btn ${myVote === 'dislike' ? 'active-dislike' : ''}`}
            onClick={() => onVote(item.id, 'dislike')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={myVote === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M17 2v11M22 11V4a2 2 0 00-2-2H7a2 2 0 00-2 1.7l-1.2 8A2 2 0 005.8 14H10v5a2 2 0 002 2 1 1 0 001-1v-2a5 5 0 011.5-3.5L17 12" /></svg>
            <span>{itemCounts.dislikes}</span>
          </button>
        </div>

        <p className="lightbox-counter">{index + 1} / {items.length}</p>
        {isOwner && (
          <button className="lightbox-delete" onClick={remove}>
            Delete post
          </button>
        )}
      </div>
    </div>
  )
}
