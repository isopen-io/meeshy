import { describe, it, expect } from 'vitest'
import {
  messageSchema,
  conversationMinimalSchema,
  conversationListResponseSchema,
} from '../../types/api-schemas'

/**
 * `clientMessageId` is the optimistic-send reconciliation key. The iOS
 * `upsertFromAPIMessages` reconciler matches an optimistic row to its
 * server-assigned record by `clientMessageId` (lookup #0). Fastify strips
 * any response field absent from the schema, so if `messageSchema` omits
 * `clientMessageId` the gateway silently drops it from `GET /messages` —
 * the reconciler then fails to match and the client renders a duplicate
 * bubble whose optimistic copy stays stuck with the pending clock.
 */
describe('messageSchema — clientMessageId reconciliation key', () => {
  it('declares clientMessageId so Fastify does not strip it from responses', () => {
    expect(messageSchema.properties).toHaveProperty('clientMessageId')
  })

  it('types clientMessageId as a nullable string', () => {
    const prop = (messageSchema.properties as Record<string, { type?: string; nullable?: boolean }>)
      .clientMessageId
    expect(prop.type).toBe('string')
    expect(prop.nullable).toBe(true)
  })
})

describe('messageSchema — postReplyTo cited-post snapshot', () => {
  it('declares postReplyTo so Fastify does not strip the frozen post snapshot', () => {
    expect(messageSchema.properties).toHaveProperty('postReplyTo')
  })

  it('exposes the cited-post detail fields (incl. type, shareCount, moodEmoji)', () => {
    const prop = (messageSchema.properties as Record<string, { properties?: Record<string, unknown> }>)
      .postReplyTo
    expect(prop.properties).toBeDefined()
    for (const field of [
      'id', 'type', 'reactionCount', 'commentCount', 'shareCount',
      'createdAt', 'thumbnailUrl', 'previewText', 'moodEmoji',
    ]) {
      expect(prop.properties).toHaveProperty(field)
    }
  })
})

describe('conversationMinimalSchema — contrat wire des userPreferences (liste)', () => {
  const prefProperties = (conversationMinimalSchema.properties.userPreferences as {
    items: { properties: Record<string, unknown> }
  }).items.properties

  it('déclare customName — il pilote le nom affiché des DM ; strippé par fast-json-stringify, la liste froide perdait le surnom et le titre flip-floppait au premier pin/mute', () => {
    expect(prefProperties.customName).toBeDefined()
  })

  it('déclare reaction — sélectionné par le gateway depuis toujours mais silencieusement strippé du wire jusqu’à ce fix', () => {
    expect(prefProperties.reaction).toBeDefined()
  })
})

/**
 * Prisme Linguistique de la ligne de liste.
 *
 * Le gateway calcule désormais l'aperçu traduit du dernier message, restreint
 * aux langues du prisme du lecteur. Ce calcul ne vaut RIEN si le schéma ne
 * déclare pas les deux champs : `fast-json-stringify` les retirerait en
 * silence, exactement comme il l'a fait pour `customName`, `reaction` et
 * `_count`. Le témoin de route (`conversation-core.test.ts`) ne peut pas voir
 * ce trou — il lit l'objet AVANT sérialisation.
 */
describe('conversationMinimalSchema — prisme de l’aperçu du dernier message', () => {
  const properties = conversationMinimalSchema.properties as Record<
    string,
    { type?: string; nullable?: boolean; additionalProperties?: unknown }
  >

  it('déclare lastMessageOriginalLanguage, sans quoi le client ne peut pas distinguer « pas de traduction » de « déjà dans ma langue »', () => {
    expect(properties.lastMessageOriginalLanguage).toBeDefined()
    expect(properties.lastMessageOriginalLanguage.type).toBe('string')
    expect(properties.lastMessageOriginalLanguage.nullable).toBe(true)
  })

  it('déclare lastMessageTranslations en objet à clés dynamiques (une par langue du lecteur)', () => {
    expect(properties.lastMessageTranslations).toBeDefined()
    expect(properties.lastMessageTranslations.type).toBe('object')
    expect(properties.lastMessageTranslations.nullable).toBe(true)
    // Sans `additionalProperties`, un schéma objet sans `properties` sérialise
    // `{}` : la carte serait vidée langue par langue au lieu d'être strippée,
    // panne plus discrète encore.
    expect(properties.lastMessageTranslations.additionalProperties).toEqual({ type: 'string' })
  })
})

/**
 * Même famille de trou, sur l'enveloppe cette fois.
 *
 * Le delta `GET /conversations?updatedSince=` est UPSERT-ONLY : une
 * conversation fermée, quittée, supprimée-pour-moi depuis un autre appareil ou
 * dont l'utilisateur a été banni ne revient dans AUCUNE réponse — elle reste en
 * cache local jusqu'à la réconciliation complète (24 h sur les deux
 * plateformes). Le gateway la déclare désormais dans `meta.deletedConversationIds`.
 *
 * `fast-json-stringify` retire tout champ absent du schéma : sans cette
 * déclaration, le calcul serveur partirait à la poubelle sur le fil, et le
 * témoin de route ne le verrait pas (il lit l'objet AVANT sérialisation) —
 * exactement le scénario `cursorPagination` documenté dans le schéma lui-même.
 */
/**
 * Le pont ✦ (G-123, tasks/lentille-implementation-contract.md §3.2 + A6).
 *
 * `fast-json-stringify` retire tout champ non déclaré ici — même piège que
 * `customName`/`reaction`/`_count` documenté plus haut. Le mapper de
 * `conversations/core.ts` peut poser `bridge` et `lastReadAt` sur l'objet
 * intermédiaire ; sans cette déclaration la route les aurait renvoyés
 * absents du fil malgré tout. Ce test ne peut PAS voir ce trou depuis un
 * témoin de route qui lit l'objet avant sérialisation — d'où sa place ici,
 * côté wire, et non côté mapper.
 */
describe('conversationMinimalSchema — le pont ✦ (G-123)', () => {
  const properties = conversationMinimalSchema.properties as Record<
    string,
    { type?: string; nullable?: boolean; properties?: Record<string, unknown> }
  >

  it('déclare bridge, sans quoi Fastify le retire du fil malgré le mapper', () => {
    expect(properties.bridge).toBeDefined()
    expect(properties.bridge.type).toBe('object')
  })

  it('déclare les quatre champs du contrat gelé sur bridge (kind, unreadCount, suggestedMode, data)', () => {
    const bridgeProperties = properties.bridge.properties as Record<string, unknown>
    for (const field of ['kind', 'unreadCount', 'suggestedMode', 'isComplete', 'data', 'text', 'translations', 'originalLanguage']) {
      expect(bridgeProperties).toHaveProperty(field)
    }
  })

  it('déclare lastReadAt, qui voyage À CÔTÉ du pont (le contrat gelé §3.2 ne le porte pas)', () => {
    expect(properties.lastReadAt).toBeDefined()
    expect(properties.lastReadAt.type).toBe('string')
  })
})

describe('conversationListResponseSchema — pierres tombales du delta', () => {
  const properties = conversationListResponseSchema.properties as Record<
    string,
    { type?: string; properties?: Record<string, { type?: string; items?: unknown }> }
  >

  it('déclare meta, sans quoi Fastify retire les tombstones du fil', () => {
    expect(properties.meta).toBeDefined()
    expect(properties.meta.type).toBe('object')
  })

  it('déclare deletedConversationIds en tableau de chaînes', () => {
    const meta = properties.meta.properties as Record<string, { type?: string; items?: { type?: string } }>
    expect(meta.deletedConversationIds).toBeDefined()
    expect(meta.deletedConversationIds.type).toBe('array')
    expect(meta.deletedConversationIds.items).toEqual({ type: 'string' })
  })

  it('déclare le drapeau de troncature, seul signal qui fait escalader le client', () => {
    const meta = properties.meta.properties as Record<string, { type?: string }>
    expect(meta.deletedConversationIdsTruncated).toBeDefined()
    expect(meta.deletedConversationIdsTruncated.type).toBe('boolean')
  })
})
