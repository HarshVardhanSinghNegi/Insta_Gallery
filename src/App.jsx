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

  const [showLogin, setShowLogin] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [activeIndex, setActiveIndex] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    loadAll()
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: mediaData }, { data: profileData }] = await Promise.all([
      supabase.from('media').select('*').order('created_at', { ascending: false }),
      supabase.from('profile').select('*').limit(1).maybeSingle(),
    ])
    setItems(mediaData || [])
    if (profileData) setProfile(profileData)
    setLoading(false)
  }

  const isOwner = !!session
  const visibleItems =
    filter === 'all' ? items : items.filter((i) => i.type === filter)
  const photoCount = items.filter((i) => i.type === 'image').length
  const videoCount = items.filter((i) => i.type === 'video').length

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
                {isOwner && (
                  <>
                    <button className="btn ghost small" onClick={() => setShowEditProfile(true)}>
                      Edit profile
                    </button>
                    <button className="btn primary small" onClick={() => setShowAdd(true)}>
                      + New post
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
              <PostThumb key={item.id} item={item} onOpen={() => setActiveIndex(item)} />
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

function PostThumb({ item, onOpen }) {
  return (
    <div className="post-thumb" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      {item.type === 'video' ? (
        <video src={item.url} muted playsInline />
      ) : (
        <img src={item.url} alt={item.title || 'Post'} loading="lazy" />
      )}
      {item.type === 'video' && (
        <span className="video-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
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

function Lightbox({ items, index, isOwner, onClose, onNavigate, onDeleted }) {
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
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M15.5 19L8.5 12l7-7" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}
      {index < items.length - 1 && (
        <button className="lightbox-nav next" onClick={goNext} aria-label="Next">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8.5 5l7 7-7 7" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}

      <div
        className="lightbox-inner"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {item.type === 'video' ? (
          <video src={item.url} controls autoPlay key={item.id} />
        ) : (
          <img src={item.url} alt={item.title || 'Post'} key={item.id} />
        )}
        {item.title && <p className="lightbox-caption">{item.title}</p>}
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
