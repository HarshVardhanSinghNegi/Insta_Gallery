// Cross-origin <a download> links often just open the file in a new tab
// instead of downloading it. Fetching as a blob first and downloading
// that forces a real "Save As" regardless of where the file is hosted.
export async function downloadFile(url, filename) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Download failed')
  const blob = await response.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
}
