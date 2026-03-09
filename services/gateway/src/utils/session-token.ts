import crypto from 'node:crypto'

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateSessionToken(deviceFingerprint?: string): string {
  const timestamp = Date.now().toString()
  const randomPart = crypto.randomBytes(16).toString('hex')
  const devicePart = deviceFingerprint
    ? crypto.createHash('sha256').update(deviceFingerprint).digest('hex').slice(0, 8)
    : crypto.randomBytes(4).toString('hex')
  return `anon_${timestamp}_${randomPart}_${devicePart}`
}
