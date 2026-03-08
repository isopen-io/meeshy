import { describe, it, expect } from '@jest/globals'
import { hashSessionToken, generateSessionToken } from '../../../utils/session-token'

describe('hashSessionToken', () => {
  it('should return a 64-char hex SHA-256 hash', () => {
    const hash = hashSessionToken('anon_123_abc')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should be deterministic', () => {
    const hash1 = hashSessionToken('anon_123_abc')
    const hash2 = hashSessionToken('anon_123_abc')
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different tokens', () => {
    const hash1 = hashSessionToken('anon_123_abc')
    const hash2 = hashSessionToken('anon_456_def')
    expect(hash1).not.toBe(hash2)
  })
})

describe('generateSessionToken', () => {
  it('should start with anon_ prefix', () => {
    const token = generateSessionToken()
    expect(token).toMatch(/^anon_/)
  })

  it('should generate unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()))
    expect(tokens.size).toBe(100)
  })

  it('should include device fingerprint when provided', () => {
    const token1 = generateSessionToken('device123')
    const token2 = generateSessionToken('device456')
    expect(token1).not.toBe(token2)
  })
})
