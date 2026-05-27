import { describe, it, expect } from 'vitest'
import { resolveParticipantLanguage } from '../../utils/conversation-helpers'

describe('resolveParticipantLanguage', () => {
  it('should return systemLanguage when configured (Prisme priority 1)', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: 'ja', regionalLanguage: 'es', systemLanguage: 'en' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('en')
  })

  it('should return regionalLanguage when no systemLanguage', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: 'ja', regionalLanguage: 'es', systemLanguage: null },
    }
    expect(resolveParticipantLanguage(participant)).toBe('es')
  })

  it('should return customDestinationLanguage when no system nor regional', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: 'ja', regionalLanguage: null, systemLanguage: null },
    }
    expect(resolveParticipantLanguage(participant)).toBe('ja')
  })

  it('should return deviceLocale (normalised) as 4th priority', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: {
        customDestinationLanguage: null,
        regionalLanguage: null,
        systemLanguage: null,
        deviceLocale: 'it-IT',
      },
    }
    expect(resolveParticipantLanguage(participant)).toBe('it')
  })

  it('should return participant.language fallback when user has no preferences nor deviceLocale', () => {
    const participant = {
      type: 'user' as const,
      language: 'fr',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: null },
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

  it('should prioritize systemLanguage over regional, custom and deviceLocale', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: {
        customDestinationLanguage: 'zh',
        regionalLanguage: 'ko',
        systemLanguage: 'ja',
        deviceLocale: 'pt',
      },
    }
    expect(resolveParticipantLanguage(participant)).toBe('ja')
  })

  it('should prioritize regionalLanguage over custom and deviceLocale when no system', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: {
        customDestinationLanguage: 'de',
        regionalLanguage: 'pt',
        systemLanguage: null,
        deviceLocale: 'sv',
      },
    }
    expect(resolveParticipantLanguage(participant)).toBe('pt')
  })

  it('should prioritize customDestinationLanguage over deviceLocale when no system nor regional', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: {
        customDestinationLanguage: 'ar',
        regionalLanguage: null,
        systemLanguage: null,
        deviceLocale: 'sv',
      },
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

  it('should treat empty string systemLanguage as absent and fall through to regional', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: '', regionalLanguage: 'es', systemLanguage: '' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('es')
  })

  it('should fall back to participant.language when all preferences are empty strings', () => {
    const participant = {
      type: 'user' as const,
      language: 'de',
      user: { customDestinationLanguage: '', regionalLanguage: '', systemLanguage: '' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('de')
  })

  it('should return participant.language for unknown participant type', () => {
    const participant = { type: 'unknown' as string, language: 'sv' }
    expect(resolveParticipantLanguage(participant)).toBe('sv')
  })
})
