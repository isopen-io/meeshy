import { describe, it, expect } from 'vitest'
import {
  resolvePrismTranslation,
  resolveLastMessagePreview,
} from '../../utils/conversation-helpers'

/**
 * Cycle 121 — la QUATRIÈME famille de résolveurs du Prisme : le contenu poussé
 * dans une notification.
 *
 * `resolveLastMessagePreview` rend un TEXTE. La bannière de notification a
 * besoin de deux choses : le texte, ET la langue qui a gagné — elle voyage sur
 * le fil APNs (`translatedLanguage`) à côté de `translatedContent`. Un second
 * exemplaire de la descente du prisme écrit chez l'appelant serait exactement
 * la copie que le dépôt interdit (« ne JAMAIS ré-implémenter le corps d'une
 * méthode de production pour tester la copie », et sa cause : deux exemplaires
 * dérivent en silence).
 *
 * `resolvePrismTranslation` est donc la descente elle-même, et
 * `resolveLastMessagePreview` en devient une projection. Ces témoins gardent la
 * PAIRE : le résolveur seul, puis l'équivalence avec son consommateur
 * historique — sans quoi rien n'empêcherait la refonte d'avoir changé la ligne
 * de liste des trois clients au passage.
 */
describe('resolvePrismTranslation — la descente du prisme, langue comprise', () => {
  it('rend la traduction du RANG 1 quand elle existe', () => {
    expect(
      resolvePrismTranslation({
        translations: { fr: 'Bonjour', es: 'Hola' },
        originalLanguage: 'en',
        preferredLanguages: ['fr', 'es'],
      })
    ).toEqual({ language: 'fr', text: 'Bonjour' })
  })

  it('DESCEND au rang 2 quand le rang 1 n\'a pas de traduction', () => {
    expect(
      resolvePrismTranslation({
        translations: { es: 'Hola' },
        originalLanguage: 'en',
        preferredLanguages: ['de', 'es'],
      })
    ).toEqual({ language: 'es', text: 'Hola' })
  })

  it('descend jusqu\'au rang 4 — la locale appareil concourt comme les autres', () => {
    expect(
      resolvePrismTranslation({
        translations: { pt: 'Olá' },
        originalLanguage: 'en',
        preferredLanguages: ['de', 'nl', 'sv', 'pt'],
      })
    ).toEqual({ language: 'pt', text: 'Olá' })
  })

  it('rend la CLÉ STOCKÉE, pas sa forme normalisée', () => {
    // Cycle 119 : normaliser pour COMPARER est juste ; normaliser ce qu'on REND
    // ne l'est que si tous les lecteurs normalisent aussi. `translatedLanguage`
    // part sur le fil APNs et est rapproché de la carte de traductions côté
    // client — la clé doit rester opposable.
    expect(
      resolvePrismTranslation({
        translations: { 'pt-BR': 'Olá' },
        originalLanguage: 'en',
        preferredLanguages: ['pt'],
      })
    ).toEqual({ language: 'pt-BR', text: 'Olá' })
  })
})

describe('resolvePrismTranslation — la langue d\'origine concourt à son RANG', () => {
  it('rend null quand la langue d\'origine gagne AVANT une traduction de rang inférieur', () => {
    // Règle critique #3. Ce témoin ne peut pas tomber contre le code d'AVANT
    // (qui ne descendait pas) : il garde le mode d'échec du CORRECTIF —
    // « prendre la première traduction disponible » servirait ici « Bonjour »
    // alors que le message est déjà écrit dans la langue de rang 2 du lecteur.
    expect(
      resolvePrismTranslation({
        translations: { fr: 'Bonjour' },
        originalLanguage: 'en',
        preferredLanguages: ['de', 'en', 'fr'],
      })
    ).toBeNull()
  })

  it('ne rétrograde PAS la langue primaire quand la langue d\'origine est plus bas', () => {
    expect(
      resolvePrismTranslation({
        translations: { fr: 'Bonjour' },
        originalLanguage: 'en',
        preferredLanguages: ['fr', 'en'],
      })
    ).toEqual({ language: 'fr', text: 'Bonjour' })
  })

  it('compare la langue d\'origine en forme CANONIQUE (région strippée)', () => {
    expect(
      resolvePrismTranslation({
        translations: { fr: 'Bonjour' },
        originalLanguage: 'en-US',
        preferredLanguages: ['en', 'fr'],
      })
    ).toBeNull()
  })
})

describe('resolvePrismTranslation — règle #1 : jamais de repli sur une traduction quelconque', () => {
  it('rend null quand aucune langue du lecteur n\'est servie', () => {
    expect(
      resolvePrismTranslation({
        translations: { es: 'Hola', it: 'Ciao' },
        originalLanguage: 'en',
        preferredLanguages: ['de'],
      })
    ).toBeNull()
  })

  it('rend null sur un prisme vide', () => {
    expect(
      resolvePrismTranslation({
        translations: { es: 'Hola' },
        originalLanguage: 'en',
        preferredLanguages: [],
      })
    ).toBeNull()
  })

  it('ignore les entrées vides ou non textuelles de la carte', () => {
    expect(
      resolvePrismTranslation({
        translations: { fr: '   ', es: 'Hola' },
        originalLanguage: 'en',
        preferredLanguages: ['fr', 'es'],
      })
    ).toEqual({ language: 'es', text: 'Hola' })
  })
})

describe('resolveLastMessagePreview — projection du même résolveur', () => {
  const cases: ReadonlyArray<{
    readonly name: string
    readonly preview: string
    readonly translations: Record<string, string>
    readonly originalLanguage: string
    readonly preferredLanguages: readonly string[]
    readonly expected: string
  }> = [
    {
      name: 'rang 1',
      preview: 'Hello',
      translations: { fr: 'Bonjour', es: 'Hola' },
      originalLanguage: 'en',
      preferredLanguages: ['fr', 'es'],
      expected: 'Bonjour',
    },
    {
      name: 'rang 2',
      preview: 'Hello',
      translations: { es: 'Hola' },
      originalLanguage: 'en',
      preferredLanguages: ['de', 'es'],
      expected: 'Hola',
    },
    {
      name: 'langue d\'origine à son rang',
      preview: 'Hello',
      translations: { fr: 'Bonjour' },
      originalLanguage: 'en',
      preferredLanguages: ['de', 'en', 'fr'],
      expected: 'Hello',
    },
    {
      name: 'aucune correspondance',
      preview: 'Hello',
      translations: { it: 'Ciao' },
      originalLanguage: 'en',
      preferredLanguages: ['de'],
      expected: 'Hello',
    },
  ]

  it.each(cases)('$name — l\'aperçu suit exactement la descente', (c) => {
    expect(
      resolveLastMessagePreview({
        preview: c.preview,
        translations: c.translations,
        originalLanguage: c.originalLanguage,
        preferredLanguages: c.preferredLanguages,
      })
    ).toBe(c.expected)

    const resolved = resolvePrismTranslation({
      translations: c.translations,
      originalLanguage: c.originalLanguage,
      preferredLanguages: c.preferredLanguages,
    })
    expect(resolved?.text ?? c.preview).toBe(c.expected)
  })
})
