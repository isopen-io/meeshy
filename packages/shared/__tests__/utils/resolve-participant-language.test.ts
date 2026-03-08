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
})
