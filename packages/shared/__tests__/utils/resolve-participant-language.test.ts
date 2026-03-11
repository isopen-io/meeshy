import { describe, it, expect } from 'vitest'
import { resolveParticipantLanguage } from '../../utils/conversation-helpers'

describe('resolveParticipantLanguage', () => {
  it('should return customDestinationLanguage for user with custom preference', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: 'ja', regionalLanguage: 'es', systemLanguage: 'en' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('ja')
  })

  it('should return regionalLanguage when no custom destination', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: null, regionalLanguage: 'es', systemLanguage: 'en' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('es')
  })

  it('should return systemLanguage as fallback for user', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: 'fr' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('fr')
  })

  it('should return participant.language for anonymous', () => {
    const participant = { type: 'anonymous' as const, language: 'fr' }
    expect(resolveParticipantLanguage(participant)).toBe('fr')
  })

  it('should return participant.language for bot', () => {
    const participant = { type: 'bot' as const, language: 'en' }
    expect(resolveParticipantLanguage(participant)).toBe('en')
  })

  it('should return participant.language for user without user object', () => {
    const participant = { type: 'user' as const, language: 'de' }
    expect(resolveParticipantLanguage(participant)).toBe('de')
  })

  it('should return participant.language for user with null user object', () => {
    const participant = { type: 'user' as const, language: 'it', user: null }
    expect(resolveParticipantLanguage(participant)).toBe('it')
  })

  it('should prioritize customDestinationLanguage over regionalLanguage and systemLanguage', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: 'zh', regionalLanguage: 'ko', systemLanguage: 'ja' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('zh')
  })

  it('should prioritize regionalLanguage over systemLanguage when no custom', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: null, regionalLanguage: 'pt', systemLanguage: 'de' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('pt')
  })

  it('should fall back to systemLanguage when both custom and regional are null', () => {
    const participant = {
      type: 'user' as const,
      language: 'fr',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: 'ar' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('ar')
  })

  it('should return participant.language for anonymous regardless of any other data', () => {
    const participant = {
      type: 'anonymous' as const,
      language: 'ko',
      user: { customDestinationLanguage: 'ja', regionalLanguage: 'zh', systemLanguage: 'en' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('ko')
  })

  it('should return participant.language for bot regardless of user object', () => {
    const participant = {
      type: 'bot' as const,
      language: 'es',
      user: { customDestinationLanguage: 'fr', regionalLanguage: null, systemLanguage: 'en' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('es')
  })

  it('should return participant.language when user type has empty string customDestinationLanguage', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: '', regionalLanguage: 'es', systemLanguage: 'fr' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('es')
  })

  it('should return systemLanguage when user has empty string for both custom and regional', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: '', regionalLanguage: '', systemLanguage: 'de' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('de')
  })

  it('should return participant.language for unknown participant type', () => {
    const participant = { type: 'unknown' as string, language: 'sv' }
    expect(resolveParticipantLanguage(participant)).toBe('sv')
  })
})
