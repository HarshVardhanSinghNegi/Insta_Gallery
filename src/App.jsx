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
  const [active, setActive] = useState(null)

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
              <PostThumb key={item.id} item={item} onOpen={() => setActive(item)} />
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
      {active && (
        <Lightbox
          item={active}
          index={items.findIndex((i) => i.id === active.id)}
          isOwner={isOwner}
          onClose={() => setActive(null)}
          onDeleted={() => {
            setActive(null)
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
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const inputRef = useRef(null)

  async function handleFile(f) {
    if (!f) return
    const isVideo = f.type.startsWith('video/')
    const isImage = f.type.startsWith('image/')
    if (!isVideo && !isImage) return

    if (isImage) {
      setProgress('Compressing…')
      const compressed = await compressImage(f)
      setFile(compressed)
      setPreview(URL.createObjectURL(compressed))
      setFileType('image')
      setProgress('')
    } else {
      setFile(f)
      setPreview(URL.createObjectURL(f))
      setFileType('video')
    }
  }

  async function save() {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const ext = fileType === 'video' ? file.name.split('.').pop() : 'jpg'
      const path = `media/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

      setProgress('Uploading…')
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

      const { error: dbErr } = await supabase.from('media').insert({
        title: title.trim(),
        type: fileType,
        url: pub.publicUrl,
        storage_path: path,
      })
      if (dbErr) throw dbErr

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
        <h2>New post</h2>

        <div className="field">
          <div
            className={`dropzone ${preview ? 'has-img' : ''}`}
            onClick={() => inputRef.current.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFile(e.dataTransfer.files[0])
            }}
          >
            {preview ? (
              fileType === 'video' ? (
                <video src={preview} controls />
              ) : (
                <img src={preview} alt="Preview" />
              )
            ) : (
              <span>Click to choose a photo or video, or drag one here</span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        </div>

        <div className="field">
          <label>Caption</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Write a caption…" />
        </div>

        {progress && <p className="progress-text">{progress}</p>}
        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!file || busy} onClick={save}>
            {busy ? 'Posting…' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Lightbox({ item, index, isOwner, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function remove() {
    if (!confirm('Delete this post?')) return
    setBusy(true)
    await supabase.storage.from(BUCKET).remove([item.storage_path])
    await supabase.from('media').delete().eq('id', item.id)
    setBusy(false)
    onDeleted()
  }

  return (
    <div className="lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button className="lightbox-close" onClick={onClose}>Close ✕</button>
      <div className="lightbox-inner">
        {item.type === 'video' ? (
          <video src={item.url} controls autoPlay />
        ) : (
          <img src={item.url} alt={item.title || 'Post'} />
        )}
        {item.title && <p className="lightbox-caption">{item.title}</p>}
        {isOwner && (
          <button className="lightbox-delete" onClick={remove} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete post'}
          </button>
        )}
      </div>
    </div>
  )
}
