import { describe, it, expect } from 'vitest'
import { resolveLastMessagePreview } from '../../utils/conversation-helpers'

/**
 * Cycle 61 — jumeau TypeScript de
 * `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`).
 *
 * Ces témoins sont le miroir un-pour-un de
 * `ConversationPrismeResolutionTests.swift` : les deux plateformes rendent la
 * MÊME ligne de liste depuis la MÊME charge REST (`lastMessageTranslations` +
 * `lastMessageOriginalLanguage`, posés par `GET /conversations` depuis le
 * cycle 60). Une divergence de résolution ferait afficher deux textes
 * différents pour un même compte selon le client — exactement la dérive que
 * la règle « une seule source de vérité » combat.
 *
 * Règle critique du Prisme (#3) : ne JAMAIS retomber sur une traduction
 * quelconque. Aucune correspondance dans les langues du lecteur ⇒ l'original.
 */
describe('resolveLastMessagePreview — aucune traduction attachée', () => {
  it("rend l'aperçu brut quand la carte est absente", () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        preferredLanguages: ['fr'],
      })
    ).toBe('Hello')
  })

  it("rend l'aperçu brut quand la carte est vide", () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        translations: {},
        preferredLanguages: ['fr'],
      })
    ).toBe('Hello')
  })

  it('rend null quand il n\'y a pas d\'aperçu du tout', () => {
    expect(
      resolveLastMessagePreview({
        preview: null,
        preferredLanguages: ['fr'],
      })
    ).toBeNull()
  })
})

describe('resolveLastMessagePreview — correspondance dans le prisme', () => {
  it('rend la traduction de la langue primaire quand elle existe', () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        originalLanguage: 'en',
        translations: { fr: 'Bonjour', es: 'Hola' },
        preferredLanguages: ['fr', 'es'],
      })
    ).toBe('Bonjour')
  })

  it('descend à la langue suivante du prisme quand la primaire manque', () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        originalLanguage: 'en',
        translations: { es: 'Hola' },
        preferredLanguages: ['de', 'es'],
      })
    ).toBe('Hola')
  })

  it("respecte l'ORDRE du prisme, pas l'ordre des clés de la carte", () => {
    // La carte énumère `es` avant `fr` ; le lecteur préfère `fr`. Un résolveur
    // qui itérerait les entrées de la carte au lieu des langues du lecteur
    // rendrait "Hola" — et personne ne le verrait sur une carte à une entrée.
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        originalLanguage: 'en',
        translations: { es: 'Hola', fr: 'Bonjour' },
        preferredLanguages: ['fr', 'es'],
      })
    ).toBe('Bonjour')
  })
})

describe('resolveLastMessagePreview — la langue d\'origine est canonique', () => {
  it("rend l'aperçu brut quand le message EST déjà dans une langue du lecteur", () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Bonjour',
        originalLanguage: 'fr',
        translations: { en: 'Hello' },
        preferredLanguages: ['fr'],
      })
    ).toBe('Bonjour')
  })

  it("préfère la traduction de la langue PRIMAIRE à l'original écrit dans une langue secondaire", () => {
    // Lecteur `['de', 'fr']`, message en français, traduction allemande
    // disponible. La langue d'origine concourt à SON rang (2e) : l'allemand
    // (rang 1) gagne. Une formulation par appartenance — « la langue d'origine
    // est quelque part dans le prisme ⇒ l'original » — rendrait « Bonjour » et
    // rétrograderait la langue primaire du lecteur.
    expect(
      resolveLastMessagePreview({
        preview: 'Bonjour',
        originalLanguage: 'fr',
        translations: { de: 'Guten Tag' },
        preferredLanguages: ['de', 'fr'],
      })
    ).toBe('Guten Tag')
  })

  it("rend l'original dès que la langue d'origine est atteinte, sans regarder plus bas", () => {
    // Lecteur `['de', 'fr']`, message allemand, traduction française
    // disponible. Le rang 1 EST la langue d'origine : on s'arrête là, et on ne
    // sert surtout pas le français du rang 2.
    expect(
      resolveLastMessagePreview({
        preview: 'Guten Tag',
        originalLanguage: 'de',
        translations: { fr: 'Bonjour' },
        preferredLanguages: ['de', 'fr'],
      })
    ).toBe('Guten Tag')
  })
})

describe('resolveLastMessagePreview — la locale appareil ne supplante pas les préférences in-app', () => {
  // Le scénario est écrit noir sur blanc dans `CLAUDE.md` : « un utilisateur
  // francophone avec un iPhone en anglais voit TOUJOURS ses messages en
  // français (priorité 1) ; la locale anglaise n'intervient que si aucune
  // traduction française n'est disponible ET qu'une traduction anglaise
  // existe ». `resolveUserLanguagesOrdered` place la locale appareil en 4e
  // position — encore faut-il que le résolveur d'aval respecte ce rang.

  it('sert le français au francophone dont le téléphone est en anglais', () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello everyone',
        originalLanguage: 'en',
        translations: { fr: 'Bonjour à tous' },
        preferredLanguages: ['fr', 'en'],
      })
    ).toBe('Bonjour à tous')
  })

  it("laisse la locale appareil servir SEULEMENT quand la langue in-app n'a rien", () => {
    // Même lecteur, aucune traduction française : l'anglais (rang 2) est la
    // langue d'origine, donc l'aperçu brut — qui EST l'anglais attendu.
    expect(
      resolveLastMessagePreview({
        preview: 'Hello everyone',
        originalLanguage: 'en',
        translations: { es: 'Hola a todos' },
        preferredLanguages: ['fr', 'en'],
      })
    ).toBe('Hello everyone')
  })
})

describe('resolveLastMessagePreview — jamais de repli sur une traduction quelconque', () => {
  it("rend l'original plutôt qu'une langue hors prisme", () => {
    // CRITIQUE : ne doit PAS rendre "Hola". Le lecteur voulait fr ou de ;
    // à défaut il reçoit l'original, pas une troisième langue.
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        originalLanguage: 'en',
        translations: { es: 'Hola' },
        preferredLanguages: ['fr', 'de'],
      })
    ).toBe('Hello')
  })

  it("rend l'aperçu brut quand le lecteur n'a aucune langue configurée", () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        translations: { fr: 'Bonjour' },
        preferredLanguages: [],
      })
    ).toBe('Hello')
  })

  it('ignore une traduction vide au lieu de blanchir la ligne', () => {
    // Une entrée présente mais vide n'est pas un aperçu : la rendre
    // remplacerait un texte lisible par une ligne blanche. Le gateway filtre
    // déjà ce cas (`buildLastMessagePreviewTranslations`), mais le chemin
    // socket et le cache persisté ne passent pas par lui.
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        originalLanguage: 'en',
        translations: { fr: '   ' },
        preferredLanguages: ['fr'],
      })
    ).toBe('Hello')
  })
})

describe('resolveLastMessagePreview — insensibilité à la casse', () => {
  it('apparie une langue du lecteur écrite en majuscules', () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        translations: { fr: 'Bonjour' },
        preferredLanguages: ['FR'],
      })
    ).toBe('Bonjour')
  })

  it('apparie une CLÉ de carte écrite en majuscules', () => {
    // iOS minuscule les clés au décodage (`APIConversation.toDomain`) ; le web
    // consomme la carte telle qu'elle arrive. La normalisation doit donc vivre
    // dans le résolveur, sinon les deux plateformes divergent sur la même
    // charge.
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        translations: { FR: 'Bonjour' },
        preferredLanguages: ['fr'],
      })
    ).toBe('Bonjour')
  })

  it("reconnaît une langue d'origine écrite en majuscules", () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Bonjour',
        originalLanguage: 'FR',
        translations: { en: 'Hello' },
        preferredLanguages: ['fr'],
      })
    ).toBe('Bonjour')
  })
})

describe('resolveLastMessagePreview — entrées dégénérées du prisme', () => {
  it('saute les entrées vides de la liste des langues du lecteur', () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        translations: { fr: 'Bonjour' },
        preferredLanguages: ['', 'fr'],
      })
    ).toBe('Bonjour')
  })

  it('tolère une carte non-objet sans lever', () => {
    expect(
      resolveLastMessagePreview({
        preview: 'Hello',
        translations: null,
        preferredLanguages: ['fr'],
      })
    ).toBe('Hello')
  })

  it("rend undefined quand l'aperçu est undefined et qu'aucune traduction ne matche", () => {
    // La distinction null/undefined est PORTÉE : `Conversation.lastMessage`
    // est optionnel côté web, et le champ ne doit pas se matérialiser en
    // chaîne "undefined" dans le rendu.
    expect(
      resolveLastMessagePreview({
        preview: undefined,
        translations: { es: 'Hola' },
        preferredLanguages: ['fr'],
      })
    ).toBeUndefined()
  })
})
