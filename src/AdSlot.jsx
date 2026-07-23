import { useEffect, useRef } from 'react'

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT_ID
const ADSENSE_ENABLED = !!ADSENSE_CLIENT

export default function AdSlot({ slotId, label = 'Ad' }) {
  const insRef = useRef(null)

  useEffect(() => {
    if (!ADSENSE_ENABLED) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch (e) {
      console.warn('AdSense push failed', e)
    }
  }, [])

  if (!ADSENSE_ENABLED) {
    // Placeholder shown until you're AdSense-approved and set
    // VITE_ADSENSE_CLIENT_ID + VITE_ADSENSE_SLOT_ID in .env
    return (
      <div className="ad-placeholder">
        <span>{label}</span>
      </div>
    )
  }

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={{ display: 'block', width: '100%', minHeight: 250 }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  )
}
