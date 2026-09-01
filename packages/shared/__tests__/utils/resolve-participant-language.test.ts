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

  // F62 — case parity with resolveUserLanguagesOrdered: an in-app pref stored
  // 'EN' must resolve to 'en' so it matches the lowercase-keyed translations.
  it('should lowercase an uppercase in-app pref', () => {
    const participant = {
      type: 'user' as const,
      language: 'fr',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: 'EN' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('en')
  })

  // The docstring promises "même normalisation de casse que resolveUserLanguage"
  // for ALL return paths, but the participant.language fallback was returned
  // verbatim. An uppercase fallback ('FR') would miss the lowercase-keyed
  // translations exactly like an un-lowercased in-app pref (Prisme violation),
  // so the fallback must be lowercased too — for users without prefs and for
  // non-user participants alike.
  it('should lowercase an uppercase participant.language fallback for a user without preferences', () => {
    const participant = {
      type: 'user' as const,
      language: 'FR',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: null },
    }
    expect(resolveParticipantLanguage(participant)).toBe('fr')
  })

  it('should lowercase an uppercase participant.language fallback for a user with a null user object', () => {
    const participant = { type: 'user' as const, language: 'IT', user: null }
    expect(resolveParticipantLanguage(participant)).toBe('it')
  })

  it('should lowercase an uppercase participant.language for an anonymous participant', () => {
    const participant = { type: 'anonymous' as const, language: 'DE' }
    expect(resolveParticipantLanguage(participant)).toBe('de')
  })

  it('should lowercase a mixed-case region-tagged in-app pref down to its lowercase code path', () => {
    const participant = {
      type: 'bot' as const,
      language: 'ES',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: 'EN' },
    }
    // bot short-circuits to the fallback (participant.language), which must be lowercased
    expect(resolveParticipantLanguage(participant)).toBe('es')
  })

  // The docstring promises the fallback gets "la même normalisation" as
  // resolveUserLanguage — and the deviceLocale level strips region/script
  // subtags via normalizeLanguageCode ('it-IT' -> 'it', asserted above). A
  // region-tagged fallback ('pt-BR') that only lowercased to 'pt-br' would
  // match no lowercase-keyed MessageTranslation.targetLanguage ('pt'), forcing
  // the client onto the original — the exact Prisme violation this function
  // claims to avoid. So the fallback must region-strip too.
  it('should strip the region subtag from a region-tagged bot fallback', () => {
    const participant = { type: 'bot' as const, language: 'pt-BR' }
    expect(resolveParticipantLanguage(participant)).toBe('pt')
  })

  it('should strip the region subtag from a region-tagged fallback for a user without preferences', () => {
    const participant = {
      type: 'user' as const,
      language: 'en-US',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: null },
    }
    expect(resolveParticipantLanguage(participant)).toBe('en')
  })

  it('should strip script and region subtags from an anonymous fallback', () => {
    const participant = { type: 'anonymous' as const, language: 'zh-Hant-HK' }
    expect(resolveParticipantLanguage(participant)).toBe('zh')
  })

  it('should strip the underscore-separated region subtag from a user-with-null-user fallback', () => {
    const participant = { type: 'user' as const, language: 'fr_FR', user: null }
    expect(resolveParticipantLanguage(participant)).toBe('fr')
  })

  // Parity floor: normalizeLanguageCode returns undefined for structurally
  // invalid input, so the fallback must NOT collapse to undefined — it retombes
  // sur `.toLowerCase()` verbatim, preserving the terminal-fallback guarantee.
  it('should preserve an unknown 2-letter fallback code verbatim (lowercased)', () => {
    const participant = { type: 'anonymous' as const, language: 'QQ' }
    expect(resolveParticipantLanguage(participant)).toBe('qq')
  })

  // The docstring's own worked example ('pt-BR' -> 'pt', asserted above) claims
  // "parité stricte avec le contrat normalizeLanguageForDedup" — but the inline
  // `normalizeLanguageCode(x) ?? x.toLowerCase()` only region-strips when
  // normalizeLanguageCode CAN reduce the code (i.e. catalogued languages). An
  // UNCATALOGUED region-tagged code (Cantonese 'yue-HK', outside the Meeshy
  // catalog) leaves normalizeLanguageCode returning undefined, so the inline
  // fallback lowercased the whole string to 'yue-hk' — the exact region-tagged
  // form the docstring says "manquerait les traductions". normalizeLanguageForDedup
  // strips the region for EVERY code, catalogued or not, so parity is only real
  // once the fallback goes through it. Registered participants already region-strip
  // uncatalogued codes (resolveUserLanguagesOrdered -> normalizeInAppLanguage), so
  // an anonymous 'yue-HK' and a registered systemLanguage 'yue-HK' must agree.
  it('should strip the region subtag from an UNCATALOGUED region-tagged anonymous fallback', () => {
    const participant = { type: 'anonymous' as const, language: 'yue-HK' }
    expect(resolveParticipantLanguage(participant)).toBe('yue')
  })

  it('should strip the region subtag from an UNCATALOGUED region-tagged user fallback (no prefs)', () => {
    const participant = {
      type: 'user' as const,
      language: 'yue-HK',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: null },
    }
    expect(resolveParticipantLanguage(participant)).toBe('yue')
  })

  it('should match the registered path for an uncatalogued region-tagged code (parity)', () => {
    const anonymous = { type: 'anonymous' as const, language: 'yue-Hant-HK' }
    const registered = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: 'yue-Hant-HK' },
    }
    expect(resolveParticipantLanguage(anonymous)).toBe(resolveParticipantLanguage(registered))
    expect(resolveParticipantLanguage(anonymous)).toBe('yue')
  })
})
