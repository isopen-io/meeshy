/**
 * Le pont ✦ — étage déterministe.
 *
 * `buildBridgeData` produit des DONNÉES structurées, jamais une phrase.
 * `formatBridge` compose la phrase côté client, via l'i18n injectée.
 *
 * C'est le cœur de l'écart E7 : une chaîne unique ne peut pas être re-résolue
 * quand le lecteur change de langue préférée. L'étage déterministe n'a donc
 * jamais de langue — `formatBridge` ne connaît aucune langue non plus, elle
 * délègue entièrement au `t` injecté par l'appelant.
 *
 * @see tasks/lentille-implementation-contract.md LWS-1, §3.2, écart E7
 */
import type { ConversationBridgeData } from '../types/conversation-bridge.js'

/**
 * Discriminants RÉELS d'un attachement de message, repris tels quels de
 * `MessageAttachment.type` (@see types/message-types.ts) — le type porté par
 * `GatewayMessage.attachments`, la forme que la gateway renvoie réellement.
 * Ne pas confondre avec `AttachmentType` (types/attachment.ts) ni
 * `MessageAttachmentType` (types/messaging.ts), deux unions voisines mais
 * distinctes qui ne circulent pas sur `GatewayMessage`.
 */
export type BridgeAttachmentKind = 'image' | 'video' | 'audio' | 'file' | 'location'

/**
 * Vue structurelle minimale d'un attachement — seul le discriminant compte
 * pour le comptage média du pont.
 */
export type BridgeAttachment = {
  readonly type: BridgeAttachmentKind
}

/**
 * Vue structurelle minimale d'un message côté pont. Volontairement
 * découplée de `GatewayMessage` (SDK purity, CLAUDE.md) : `buildBridgeData`
 * reste une loi pure, agnostique de la forme complète transportée par la
 * gateway ou du cache client — elle ne consomme que ce dont elle a besoin.
 * Le nom de l'auteur est résolu par l'appelant (Participant, User, profil
 * anonyme…) : cette fonction ne sait pas résoudre une identité, seulement
 * composer un pont à partir d'identités déjà résolues.
 */
export type BridgeMessage = {
  readonly senderId: string
  readonly senderName: string
  readonly attachments?: readonly BridgeAttachment[]
}

export type BuildBridgeDataParams = {
  /** Fenêtre de messages disponible (cache local ou page gateway). */
  readonly messages: readonly BridgeMessage[]
  /** Identifiant du lecteur — ses propres messages n'alimentent jamais le pont. */
  readonly viewerId: string
  /** Nombre de messages non lus connu par l'appelant (compteur autoritatif). */
  readonly unreadCount: number
}

/**
 * Construit les données déterministes du pont ✦ à partir des messages non lus
 * du lecteur.
 *
 * Règles :
 * - `unreadCount === 0` ⇒ `null`, JAMAIS un pont vide (critère LWS-1).
 * - `fromOthers.length === 0` (tous les messages de la fenêtre sont ceux du
 *   lecteur, une fois exclus) ⇒ `null` aussi (BLOCAGE 5, revue REV-1) : il
 *   n'y a RIEN à annoncer, un pont aux champs vides serait trompeur (« X a
 *   écrit » sans X). Les deux conditions se combinent en un seul early
 *   return : `unreadCount === 0 || fromOthers.length === 0`.
 * - Les messages envoyés par le lecteur lui-même n'alimentent ni les auteurs,
 *   ni `messageCount`, ni `mediaCounts` — un pont annonce ce que l'ON a
 *   manqué, jamais ses propres messages.
 * - Auteurs dédupliqués par `senderId` (deux comptes différents peuvent
 *   partager un nom affiché), dans l'ordre d'apparition. Deux au plus sont
 *   nommés ; le reste bascule dans `extraAuthorCount`.
 * - `mediaCounts` regroupe les attachements par kind réel. `images` et
 *   `audio` ont chacun leur bucket ; tout le reste (`video`, `file`,
 *   `location` — et tout kind futur inconnu de ce triptyque) tombe dans
 *   `files`, seul bucket restant du type gelé `ConversationBridgeData`.
 *   RÉSERVE 10 (revue REV-1) : la clé `mediaCounts` elle-même n'est émise
 *   QUE s'il y a au moins un média dans la fenêtre, et à l'intérieur,
 *   chaque compteur (`images`/`audio`/`files`) est ABSENT — pas `0` — quand
 *   sa catégorie n'a rien à annoncer, alignement avec le miroir Swift
 *   (`ConversationBridgeMediaCounts`, `CoreModels.swift`, commentaire
 *   « chaque compteur est ABSENT — pas zéro »).
 */
export function buildBridgeData(params: BuildBridgeDataParams): ConversationBridgeData | null {
  const { messages, viewerId, unreadCount } = params

  const fromOthers = messages.filter((message) => message.senderId !== viewerId)

  if (unreadCount === 0 || fromOthers.length === 0) return null

  const seenAuthorIds = new Set<string>()
  const orderedAuthorNames: string[] = []
  for (const message of fromOthers) {
    if (seenAuthorIds.has(message.senderId)) continue
    seenAuthorIds.add(message.senderId)
    orderedAuthorNames.push(message.senderName)
  }

  const rawMediaCounts = fromOthers.reduce(
    (counts, message) => {
      const attachments = message.attachments ?? []
      const images = attachments.filter((attachment) => attachment.type === 'image').length
      const audio = attachments.filter((attachment) => attachment.type === 'audio').length
      const files = attachments.length - images - audio
      return {
        images: counts.images + images,
        audio: counts.audio + audio,
        files: counts.files + files,
      }
    },
    { images: 0, audio: 0, files: 0 }
  )

  const hasAnyMedia = rawMediaCounts.images > 0 || rawMediaCounts.audio > 0 || rawMediaCounts.files > 0
  const mediaCounts = hasAnyMedia
    ? {
        ...(rawMediaCounts.images > 0 ? { images: rawMediaCounts.images } : {}),
        ...(rawMediaCounts.audio > 0 ? { audio: rawMediaCounts.audio } : {}),
        ...(rawMediaCounts.files > 0 ? { files: rawMediaCounts.files } : {}),
      }
    : undefined

  return {
    authors: orderedAuthorNames.slice(0, 2),
    extraAuthorCount: Math.max(0, orderedAuthorNames.length - 2),
    messageCount: fromOthers.length,
    ...(mediaCounts !== undefined ? { mediaCounts } : {}),
  }
}

/**
 * Fonction de traduction injectée — agnostique de toute bibliothèque i18n
 * précise (next-intl, react-i18next, système SDK…). `formatBridge` ne connaît
 * ni langue ni catalogue : elle compose des clés et des paramètres, le `t`
 * de l'appelant fait le reste.
 */
export type BridgeTranslate = (key: string, params?: Record<string, string | number>) => string

const AUTHORS_ONE_KEY = 'lentille.bridge.authorsOne'
const AUTHORS_TWO_KEY = 'lentille.bridge.authorsTwo'
const AUTHORS_MORE_KEY = 'lentille.bridge.authorsMore'
const MESSAGES_KEY = 'lentille.bridge.messages'
const MEDIA_KEY_BY_KIND = {
  images: 'lentille.bridge.media.images',
  audio: 'lentille.bridge.media.audio',
  files: 'lentille.bridge.media.files',
} as const

function formatAuthorsSegment(data: ConversationBridgeData, t: BridgeTranslate): string | null {
  const [first, second] = data.authors

  if (first && second && data.extraAuthorCount > 0) {
    return t(AUTHORS_MORE_KEY, { a: first, b: second, count: data.extraAuthorCount })
  }
  if (first && second) {
    return t(AUTHORS_TWO_KEY, { a: first, b: second })
  }
  if (first) {
    return t(AUTHORS_ONE_KEY, { name: first })
  }
  return null
}

function formatMessagesSegment(data: ConversationBridgeData, t: BridgeTranslate): string | null {
  return data.messageCount > 0 ? t(MESSAGES_KEY, { count: data.messageCount }) : null
}

function formatMediaSegment(data: ConversationBridgeData, t: BridgeTranslate): string | null {
  const counts = data.mediaCounts
  if (!counts) return null

  const parts = (Object.keys(MEDIA_KEY_BY_KIND) as ReadonlyArray<keyof typeof MEDIA_KEY_BY_KIND>)
    .map((kind) => ({ kind, count: counts[kind] }))
    .filter((entry): entry is { kind: keyof typeof MEDIA_KEY_BY_KIND; count: number } =>
      typeof entry.count === 'number' && entry.count > 0
    )
    .map((entry) => t(MEDIA_KEY_BY_KIND[entry.kind], { count: entry.count }))

  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Compose la phrase du pont ✦ à partir de données déterministes déjà
 * calculées par `buildBridgeData`, via l'i18n injectée par le client.
 *
 * Preuve E7 : cette fonction ne connaît AUCUNE langue. Le même `data` passé
 * à deux `t` de langues différentes rend deux phrases différentes — la
 * langue vit entièrement dans le `t` injecté, jamais ici.
 */
export function formatBridge(data: ConversationBridgeData, t: BridgeTranslate): string {
  return [formatAuthorsSegment(data, t), formatMessagesSegment(data, t), formatMediaSegment(data, t)]
    .filter((segment): segment is string => segment !== null && segment.trim() !== '')
    .join(' · ')
}
