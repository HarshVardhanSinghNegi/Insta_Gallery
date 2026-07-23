// Resizes and compresses an image in the browser before upload.
// This can shrink a 10MB phone photo down to ~500KB-1MB with no
// visible quality loss at normal viewing sizes, stretching free
// storage quotas much further.

const MAX_DIMENSION = 1920 // px, longest side
const JPEG_QUALITY = 0.82

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img

        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width)
          width = MAX_DIMENSION
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height)
          height = MAX_DIMENSION
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression failed'))
              return
            }
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'),
              { type: 'image/jpeg' }
            )
            resolve(compressedFile)
          },
          'image/jpeg',
          JPEG_QUALITY
        )
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
