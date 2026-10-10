import { describe, it, expect } from 'vitest'
import { resolveParticipantLanguage } from '../../utils/conversation-helpers'
import { normalizeLanguageForDedup } from '../../utils/language-normalize'

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

  // #9247 — LE DÉFAUT NE S'OBSERVE QUE HORS CATALOGUE.
  //
  // Pour un code catalogué ('pt-BR' → 'pt', 'EN' → 'en'), l'ancien repli
  // `normalizeLanguageCode(x) ?? x.toLowerCase()` et la SSOT rendent le MÊME
  // verdict : un témoin posé là ne peut pas tomber, et c'est pourquoi les
  // témoins ci-dessus étaient tous verts pendant la vie du défaut. Hors
  // catalogue, `normalizeLanguageCode` rend `undefined` et le repli
  // `.toLowerCase()` GARDE le sous-tag de région, quand le chemin INSCRIT
  // (`normalizeInAppLanguage`) le strippe — deux formes pour une même langue.
  it.each([
    ['yue-HK', 'yue'],
    ['fil-PH', 'fil'],
    ['xyz_AB', 'xyz'],
    ['zh-Hant-HK', 'zh'],
  ])('should strip the region of an UNCATALOGUED fallback code (%s -> %s)', (declared, expected) => {
    const participant = { type: 'anonymous' as const, language: declared }
    expect(resolveParticipantLanguage(participant)).toBe(expected)
  })

  // Parité par CONFRONTATION à la SSOT, jamais par recopie d'une table de
  // valeurs attendues : une copie dériverait, et c'est précisément la dérive
  // entre deux formes de la même normalisation qui a produit le défaut.
  it('should delegate its fallback to normalizeLanguageForDedup — the SSOT of the couple', () => {
    for (const declared of ['yue-HK', 'fil-PH', 'xyz_AB', 'zh-Hant-HK', 'pt-BR', 'EN', 'en-US', 'QQ', '-US', '@@@']) {
      const participant = { type: 'anonymous' as const, language: declared }
      expect(resolveParticipantLanguage(participant)).toBe(normalizeLanguageForDedup(declared))
    }
  })
})
