import { describe, it, expect } from 'vitest'
import { buildPostTranslationRecord, resolvePrismTranslation } from '../../utils/conversation-helpers'

/**
 * #4968 — `buildPostTranslationRecord` est la SSOT du dialecte CARTE
 * (`Post.translations` / `PostComment.translations`,
 * `{ [langue]: { text, translationModel, … } }`), distinct du dialecte TABLEAU
 * que dépouille `buildTranslationRecord` (`Message.translations` tel que servi
 * sur le fil). `apps/web/hooks/use-post-translation.ts` réécrivait ce
 * dépouillement à la main — la jumelle d'ADAPTATEUR que le § Prisme du
 * `CLAUDE.md` racine interdit.
 */
describe('buildPostTranslationRecord', () => {
  it('dépouille une carte { langue: { text } } en Record<langue, texte>', () => {
    expect(
      buildPostTranslationRecord({
        fr: { text: 'Bonjour', translationModel: 'nllb', createdAt: '2026-01-01' },
        es: { text: 'Hola' },
      })
    ).toEqual({ fr: 'Bonjour', es: 'Hola' })
  })

  it('ignore une entrée sans texte string', () => {
    expect(buildPostTranslationRecord({ fr: { translationModel: 'nllb' } })).toEqual({})
  })

  it('ignore une entrée à texte vide ou blanc', () => {
    expect(buildPostTranslationRecord({ fr: { text: '' }, es: { text: '   ' } })).toEqual({})
  })

  it('rend un objet vide sur null/undefined', () => {
    expect(buildPostTranslationRecord(null)).toEqual({})
    expect(buildPostTranslationRecord(undefined)).toEqual({})
  })

  it('rend un objet vide sur un TABLEAU — dialecte étranger, pas une erreur silencieuse déguisée en repli', () => {
    // Le dialecte tableau (Message.translations) est celui de `buildTranslationRecord`,
    // pas celui-ci : lui passer un tableau ne doit jamais produire une carte partielle.
    expect(buildPostTranslationRecord([{ language: 'fr', content: 'Bonjour' }])).toEqual({})
  })

  it('rend un objet vide sur une primitive', () => {
    expect(buildPostTranslationRecord('nope')).toEqual({})
    expect(buildPostTranslationRecord(42)).toEqual({})
  })

  it('conserve la clé VERBATIM (non normalisée) — la comparaison se normalise en aval', () => {
    expect(buildPostTranslationRecord({ 'pt-BR': { text: 'Olá' } })).toEqual({ 'pt-BR': 'Olá' })
  })

  it('alimente resolvePrismTranslation bout en bout, rang 3 du prisme', () => {
    const record = buildPostTranslationRecord({
      pt: { text: 'Olá mundo' },
    })
    expect(
      resolvePrismTranslation({
        translations: record,
        originalLanguage: 'es',
        preferredLanguages: ['de', 'fr', 'pt'],
      })
    ).toEqual({ language: 'pt', text: 'Olá mundo' })
  })
})
