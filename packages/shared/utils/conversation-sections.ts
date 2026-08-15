/**
 * Sectionnement et tri des conversations — La Lentille.
 *
 * `resolveConversationSections` partitionne une liste de conversations en
 * sections ORDONNÉES : `pinned` → `live` → catégories utilisateur (dans
 * l'ordre déclaré) → `today` → `yesterday` → `thisWeek` → `older`. Aucune
 * section vide n'est émise, et chaque conversation apparaît dans EXACTEMENT
 * une section — précédence : épinglée > live > catégorie > temporel.
 *
 * `sortConversations` est l'ordre total qui alimente chaque section :
 * épinglées → live → catégorie (`orderInCategory`) → `lastMessageAt` desc
 * (repli `updatedAt`) → `id` (départage déterministe, aucun `hashValue`,
 * aucune graine).
 *
 * Loi pure, partagée par les trois frontends (workshop §2). Aucune I/O,
 * aucune dépendance de plateforme : le « maintenant » du lecteur (`now`) et
 * son fuseau (`timeZone`) sont TOUJOURS injectés, jamais lus depuis
 * `Date.now()` ou `Intl.DateTimeFormat().resolvedOptions().timeZone` à
 * l'intérieur de cette loi — fournir l'horloge et le fuseau muraux est la
 * responsabilité des peaux (hooks React, ViewModels Swift/Kotlin).
 *
 * @see tasks/lentille-implementation-contract.md LWS-1, écarts E5 et E11
 */
import type { ConversationLiveCall } from '../types/conversation-bridge.js'

/**
 * Projection STRUCTURELLE minimale d'une conversation — uniquement les
 * champs dont cette loi a besoin, jamais le type `Conversation` complet
 * (`packages/shared/types/conversation.ts`) ni le modèle iOS `Conversation`
 * consommé par `ConversationListViewModel.groupConversations` (`:554`,
 * corps `:559-600`). Re-prouvé contre les deux avant d'écrire ce fichier :
 *
 * - `isPinned` / `categoryId` / `orderInCategory` : le wire `GET
 *   /conversations` les porte sous `userPreferences`
 *   (`conversationUserPreferencesSelect`,
 *   `services/gateway/src/routes/conversations/core.ts:108-122`, et
 *   `orderInCategory` sur `UserConversationPreferences`,
 *   `packages/shared/types/user-preferences.ts:17-18` /
 *   `schema.prisma:2098`). iOS porte les TROIS mêmes champs sous
 *   `Conversation.userState` — `isPinned`, `sectionId` (= `categoryId`,
 *   renommé), `orderInCategory`
 *   (`packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationUserState.swift`).
 * - `lastMessageAt` / `updatedAt` : déjà au même nom sur les deux
 *   (`packages/shared/types/conversation.ts:333,380`).
 * - `liveCall` : n'existe sur AUCUNE plateforme aujourd'hui — vérifié,
 *   `CoreModels.swift` n'a ni `activeCall` ni `callState`
 *   (`tasks/lentille-focal-workshop.md` ligne 198). Il est posé par la peau
 *   depuis `ConversationLiveCallProviding` AVANT d'appeler cette loi,
 *   exactement comme `bridge` est posé sur `MeeshyConversation` (LWS-2,
 *   écart E13). `null`/`undefined` = aucun appel connu ⇒ jamais de section
 *   EN DIRECT fabriquée à partir d'une donnée absente.
 *
 * `lastMessage.createdAt` N'APPARAÎT PAS ICI : c'est délibéré (garde E11).
 * La loi ne doit JAMAIS lire cette date — seule `lastMessageAt` (repli
 * `updatedAt`) fait foi. Un champ absent du type est une garde plus forte
 * qu'une règle documentée dans un commentaire : personne ne peut le lire
 * par accident, ici ou dans un miroir Swift/Kotlin qui recopierait ce type.
 */
export type SectionableConversation = {
  readonly id: string
  readonly isPinned: boolean
  readonly categoryId?: string | null
  readonly orderInCategory?: number | null
  readonly lastMessageAt?: Date | null
  readonly updatedAt: Date
  readonly liveCall?: ConversationLiveCall | null
}

/**
 * Catégorie utilisateur déclarée. Le tableau `categories` reçu par
 * `resolveConversationSections` DOIT déjà être ordonné dans l'ordre déclaré
 * par l'utilisateur (`UserConversationCategory.order` côté web/gateway,
 * position dans `categories: [ConversationSection]` côté iOS,
 * `ConversationListViewModel.swift:583`) : cette loi ne trie jamais les
 * catégories entre elles, elle respecte l'ordre du tableau reçu.
 */
export type SectionableCategory = {
  readonly id: string
}

type TemporalSectionKind = 'today' | 'yesterday' | 'thisWeek' | 'older'

export type ConversationSection =
  | { readonly kind: 'pinned'; readonly conversations: readonly SectionableConversation[] }
  | { readonly kind: 'live'; readonly conversations: readonly SectionableConversation[] }
  | {
      readonly kind: 'category'
      readonly categoryId: string
      readonly conversations: readonly SectionableConversation[]
    }
  | { readonly kind: TemporalSectionKind; readonly conversations: readonly SectionableConversation[] }

export type ResolveConversationSectionsParams = {
  readonly conversations: readonly SectionableConversation[]
  readonly categories: readonly SectionableCategory[]
  readonly now: Date
  /**
   * Réservée par le contrat d'appel (workshop, LWS-1) pour un usage FUTUR —
   * libellés de section localisés côté peau. Volontairement INUTILISÉE par
   * le calcul des bornes calendaires ci-dessous : forcer un calendrier
   * `gregory` fixe (voir `localCalendarDate`) est la seule façon de
   * garantir que « aujourd'hui »/« hier » ne dérive pas selon la locale de
   * l'utilisateur — certaines locales (`ar-SA`, `fa-IR`…) sélectionnent par
   * défaut, dans `Intl.DateTimeFormat`, un calendrier NON grégorien, ce qui
   * ferait dériver silencieusement le triplet année/mois/jour si `locale`
   * pilotait le calendrier. `timeZone` est le seul levier de localisation
   * dont cette loi a besoin pour ses bornes.
   */
  readonly locale: string
  readonly timeZone: string
}

const hasLiveCall = (conversation: SectionableConversation): boolean => conversation.liveCall != null

const hasCategory = (conversation: SectionableConversation): boolean => {
  const categoryId = conversation.categoryId
  return categoryId != null && categoryId !== ''
}

/** `lastMessageAt`, repli `updatedAt` — JAMAIS `lastMessage.createdAt` (garde E11). */
const effectiveTimestamp = (conversation: SectionableConversation): number =>
  (conversation.lastMessageAt ?? conversation.updatedAt).getTime()

type CalendarDate = { readonly year: number; readonly month: number; readonly day: number }

/**
 * Fixe le calendrier à `gregory` et la locale de FORMATAGE à `en-CA`
 * (chiffres arabes, ordre année/mois/jour stable) — seul `timeZone` fait
 * varier le résultat. C'est la mécanique qui rend cette loi « calendrier du
 * lecteur, jamais UTC » : `Intl.DateTimeFormat` projette `date` (un instant
 * epoch unique, indépendant de tout fuseau) sur le mur de `timeZone`, puis
 * on lit le triplet année/mois/jour AFFICHÉ à ce lecteur — jamais
 * `date.getUTCFullYear()`/`getUTCDate()`, qui figeraient tout le monde sur
 * le fuseau UTC quel que soit `timeZone`.
 */
const localCalendarDate = (date: Date, timeZone: string): CalendarDate => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'gregory',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const read = (type: 'year' | 'month' | 'day'): number =>
    Number(parts.find((part) => part.type === type)?.value)

  return { year: read('year'), month: read('month'), day: read('day') }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Écart en JOURS CALENDAIRES entre deux triplets année/mois/jour — jamais
 * une soustraction d'instants epoch bruts, qui se ferait piéger par les
 * transitions d'heure d'été/hiver du fuseau du lecteur (un jour de 23 h ou
 * 25 h resterait à 1 jour d'écart calendaire, pas 0,96 ou 1,04). Les deux
 * dates sont réinterprétées à minuit UTC — un axe purement numérique, sans
 * fuseau ni DST, uniquement pour compter des jours entiers.
 */
const daysBetween = (from: CalendarDate, to: CalendarDate): number => {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day)
  const toMs = Date.UTC(to.year, to.month - 1, to.day)
  return Math.round((fromMs - toMs) / MS_PER_DAY)
}

const YESTERDAY_DAYS = 1
const THIS_WEEK_MAX_DAYS = 6

/**
 * Borne temporelle d'une conversation, dans le calendrier DU LECTEUR. Une
 * conversation dont l'horodatage effectif tombe après `now` (horloge en
 * légère avance côté client, par exemple) est traitée comme `today` plutôt
 * que rejetée dans un jour négatif qui n'existe dans aucune section.
 */
const resolveTemporalSection = (
  conversation: SectionableConversation,
  now: Date,
  timeZone: string
): TemporalSectionKind => {
  const nowDate = localCalendarDate(now, timeZone)
  const conversationDate = localCalendarDate(new Date(effectiveTimestamp(conversation)), timeZone)
  const diffDays = Math.max(0, daysBetween(nowDate, conversationDate))

  if (diffDays === 0) return 'today'
  if (diffDays === YESTERDAY_DAYS) return 'yesterday'
  if (diffDays <= THIS_WEEK_MAX_DAYS) return 'thisWeek'
  return 'older'
}

const compareCategoryId = (a: SectionableConversation, b: SectionableConversation): number => {
  const aId = a.categoryId ?? ''
  const bId = b.categoryId ?? ''
  if (aId === bId) return 0
  return aId < bId ? -1 : 1
}

const ORDER_IN_CATEGORY_FALLBACK = Number.POSITIVE_INFINITY

const compareOrderInCategory = (a: SectionableConversation, b: SectionableConversation): number => {
  const aOrder = a.orderInCategory ?? ORDER_IN_CATEGORY_FALLBACK
  const bOrder = b.orderInCategory ?? ORDER_IN_CATEGORY_FALLBACK
  // Comparaison par égalité/ordre plutôt qu'une soustraction : `Infinity -
  // Infinity` vaut `NaN`, une valeur de comparateur invalide qui rendrait
  // l'ordre de deux conversations sans `orderInCategory` non déterministe.
  if (aOrder === bOrder) return 0
  return aOrder < bOrder ? -1 : 1
}

/** `lastMessageAt` desc, repli `updatedAt` — JAMAIS `lastMessage.createdAt` (E11). */
const compareTimestamp = (a: SectionableConversation, b: SectionableConversation): number =>
  effectiveTimestamp(b) - effectiveTimestamp(a)

/**
 * Départage final déterministe : comparaison ORDINALE de chaîne sur `id`.
 * Aucun `hashValue`, aucune graine — le même jeu d'entrée rend le même
 * ordre sur n'importe quel processus, n'importe quelle exécution (critère
 * de stabilité LWS-1).
 */
const compareId = (a: SectionableConversation, b: SectionableConversation): number => {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * Ordre total : épinglées → live → catégorie (`orderInCategory`) →
 * `lastMessageAt` desc (repli `updatedAt`) → `id`.
 *
 * Appliquée telle quelle à l'intérieur de chaque section par
 * `resolveConversationSections` : comme chaque section est homogène sur les
 * trois premiers critères (toutes épinglées, ou toutes live, ou toutes de
 * la MÊME catégorie, ou aucune des trois), le comparateur dégénère
 * naturellement au critère pertinent pour cette section — une seule loi, ni
 * dupliquée ni spécialisée par section.
 */
export const sortConversations = (
  conversations: readonly SectionableConversation[]
): readonly SectionableConversation[] =>
  [...conversations].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1

    const aLive = hasLiveCall(a)
    const bLive = hasLiveCall(b)
    if (aLive !== bLive) return aLive ? -1 : 1

    const aCategory = hasCategory(a)
    const bCategory = hasCategory(b)
    if (aCategory !== bCategory) return aCategory ? -1 : 1
    if (aCategory && bCategory) {
      const categoryCompare = compareCategoryId(a, b)
      if (categoryCompare !== 0) return categoryCompare
      const orderCompare = compareOrderInCategory(a, b)
      if (orderCompare !== 0) return orderCompare
    }

    const timestampCompare = compareTimestamp(a, b)
    if (timestampCompare !== 0) return timestampCompare

    return compareId(a, b)
  })

type SectionTarget =
  | { readonly kind: 'pinned' }
  | { readonly kind: 'live' }
  | { readonly kind: 'category'; readonly categoryId: string }
  | { readonly kind: TemporalSectionKind }

/**
 * Précédence de partition (documentée par le contrat, LWS-1) : épinglée
 * PRIME sur live, live PRIME sur catégorie, catégorie PRIME sur temporel.
 * Une conversation épinglée ET en direct atterrit dans `pinned`, jamais
 * `live` — chaque conversation ne peut être classée que par la PREMIÈRE
 * règle qui s'applique.
 *
 * Une conversation dont `categoryId` ne correspond à AUCUNE catégorie
 * déclarée (catégorie supprimée depuis, ou jamais synchronisée) est traitée
 * comme non catégorisée et retombe sur le temporel — même précédent que le
 * `other` orphelin de `ConversationListViewModel.groupConversations`
 * (`:590-594`), jamais une section fantôme pour un id inconnu.
 */
const classify = (
  conversation: SectionableConversation,
  declaredCategoryIds: ReadonlySet<string>,
  now: Date,
  timeZone: string
): SectionTarget => {
  if (conversation.isPinned) return { kind: 'pinned' }
  if (hasLiveCall(conversation)) return { kind: 'live' }

  const categoryId = conversation.categoryId
  if (categoryId != null && declaredCategoryIds.has(categoryId)) {
    return { kind: 'category', categoryId }
  }

  return { kind: resolveTemporalSection(conversation, now, timeZone) }
}

type SectionPartition = {
  readonly pinned: readonly SectionableConversation[]
  readonly live: readonly SectionableConversation[]
  readonly byCategory: ReadonlyMap<string, readonly SectionableConversation[]>
  readonly temporal: Readonly<Record<TemporalSectionKind, readonly SectionableConversation[]>>
}

const emptyPartition = (): SectionPartition => ({
  pinned: [],
  live: [],
  byCategory: new Map(),
  temporal: { today: [], yesterday: [], thisWeek: [], older: [] },
})

const partitionConversations = (
  conversations: readonly SectionableConversation[],
  declaredCategoryIds: ReadonlySet<string>,
  now: Date,
  timeZone: string
): SectionPartition =>
  conversations.reduce<SectionPartition>((partition, conversation) => {
    const target = classify(conversation, declaredCategoryIds, now, timeZone)

    if (target.kind === 'pinned') {
      return { ...partition, pinned: [...partition.pinned, conversation] }
    }
    if (target.kind === 'live') {
      return { ...partition, live: [...partition.live, conversation] }
    }
    if (target.kind === 'category') {
      const existing = partition.byCategory.get(target.categoryId) ?? []
      const nextByCategory = new Map(partition.byCategory)
      nextByCategory.set(target.categoryId, [...existing, conversation])
      return { ...partition, byCategory: nextByCategory }
    }
    return {
      ...partition,
      temporal: {
        ...partition.temporal,
        [target.kind]: [...partition.temporal[target.kind], conversation],
      },
    }
  }, emptyPartition())

const TEMPORAL_SECTION_ORDER: readonly TemporalSectionKind[] = ['today', 'yesterday', 'thisWeek', 'older']

/**
 * Sections ORDONNÉES : `pinned` → `live` → catégories utilisateur (dans
 * l'ordre déclaré par `categories`) → `today` → `yesterday` → `thisWeek` →
 * `older`. Aucune section vide n'est émise. Chaque conversation de
 * `conversations` apparaît dans EXACTEMENT une section — l'union des
 * sections rendues reconstitue `conversations` sans perte ni doublon
 * (partition, critère LWS-1).
 */
export const resolveConversationSections = (
  params: ResolveConversationSectionsParams
): readonly ConversationSection[] => {
  const { conversations, categories, now, timeZone } = params
  const declaredCategoryIds = new Set(categories.map((category) => category.id))
  const partition = partitionConversations(conversations, declaredCategoryIds, now, timeZone)

  const pinnedSections: readonly ConversationSection[] =
    partition.pinned.length > 0
      ? [{ kind: 'pinned' as const, conversations: sortConversations(partition.pinned) }]
      : []

  const liveSections: readonly ConversationSection[] =
    partition.live.length > 0
      ? [{ kind: 'live' as const, conversations: sortConversations(partition.live) }]
      : []

  const categorySections: readonly ConversationSection[] = categories.flatMap((category) => {
    const bucket = partition.byCategory.get(category.id)
    if (bucket === undefined || bucket.length === 0) return []
    return [{ kind: 'category' as const, categoryId: category.id, conversations: sortConversations(bucket) }]
  })

  const temporalSections: readonly ConversationSection[] = TEMPORAL_SECTION_ORDER.flatMap((kind) => {
    const bucket = partition.temporal[kind]
    if (bucket.length === 0) return []
    return [{ kind, conversations: sortConversations(bucket) }]
  })

  return [...pinnedSections, ...liveSections, ...categorySections, ...temporalSections]
}
