/**
 * Tests du sectionnement et du tri des conversations (LWS-1, C-017/C-018).
 * @see tasks/lentille-implementation-contract.md §3.2/LWS-1, écarts E5 et E11
 */
import { describe, it, expect } from 'vitest'
import {
  resolveConversationSections,
  sortConversations,
  type SectionableConversation,
  type SectionableCategory,
  type ConversationSection,
} from '../utils/conversation-sections'

const NOW = new Date('2026-08-15T12:00:00Z')

const daysAgo = (days: number, from: Date = NOW): Date => new Date(from.getTime() - days * 24 * 60 * 60 * 1000)

const createConversation = (overrides: Partial<SectionableConversation> = {}): SectionableConversation => ({
  id: 'conversation-1',
  isPinned: false,
  categoryId: null,
  orderInCategory: null,
  lastMessageAt: daysAgo(0),
  updatedAt: daysAgo(0),
  liveCall: null,
  ...overrides,
})

const createLiveCall = () => ({ voices: 2, startedAt: NOW.toISOString(), joined: false })

const allConversations = (sections: readonly ConversationSection[]): readonly SectionableConversation[] =>
  sections.flatMap((section) => section.conversations)

describe('resolveConversationSections — partition', () => {
  it('places every conversation in exactly one section — union covers the input with no gain nor loss, on a varied 40-item set', () => {
    const categories: readonly SectionableCategory[] = [
      { id: 'cat-work' },
      { id: 'cat-friends' },
      { id: 'cat-family' },
    ]

    const conversations: readonly SectionableConversation[] = Array.from({ length: 40 }, (_, i) => {
      const isPinned = i % 7 === 0
      const isLive = !isPinned && i % 5 === 0
      const categoryId =
        !isPinned && !isLive
          ? i % 11 === 0
            ? 'cat-deleted-orphan' // catégorie jamais déclarée — doit retomber sur le temporel
            : i % 3 === 0
              ? categories[i % categories.length]!.id
              : null
          : null

      return createConversation({
        id: `conv-${i}`,
        isPinned,
        liveCall: isLive ? createLiveCall() : null,
        categoryId,
        orderInCategory: categoryId !== null ? i : null,
        lastMessageAt: daysAgo(i % 12), // étale de today à older
        updatedAt: daysAgo(i % 12),
      })
    })

    const sections = resolveConversationSections({ conversations, categories, now: NOW, locale: 'fr', timeZone: 'Europe/Paris' })

    const outputIds = allConversations(sections).map((c) => c.id)
    const inputIds = conversations.map((c) => c.id)

    expect(outputIds.length).toBe(inputIds.length)
    expect(new Set(outputIds).size).toBe(outputIds.length) // aucun doublon
    expect(new Set(outputIds)).toEqual(new Set(inputIds)) // aucune perte, aucun gain
  })

  it('a pinned AND live conversation lands in pinned, never live — pinned primes over live', () => {
    const conversation = createConversation({ id: 'pinned-and-live', isPinned: true, liveCall: createLiveCall() })
    const sections = resolveConversationSections({
      conversations: [conversation],
      categories: [],
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]?.kind).toBe('pinned')
  })

  it('a live conversation with a categoryId lands in live, never in its category — live primes over category', () => {
    const conversation = createConversation({
      id: 'live-and-categorized',
      liveCall: createLiveCall(),
      categoryId: 'cat-work',
    })
    const sections = resolveConversationSections({
      conversations: [conversation],
      categories: [{ id: 'cat-work' }],
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]?.kind).toBe('live')
  })

  it('a categoryId that matches no declared category falls back to the temporal bucket, not a phantom section', () => {
    const conversation = createConversation({ id: 'orphan', categoryId: 'cat-deleted-long-ago' })
    const sections = resolveConversationSections({
      conversations: [conversation],
      categories: [{ id: 'cat-work' }],
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]?.kind).toBe('today')
  })
})

describe('resolveConversationSections — sections vides et position déclarée', () => {
  it('never emits a section for an empty category', () => {
    const sections = resolveConversationSections({
      conversations: [createConversation({ id: 'c1' })], // uncategorized → today
      categories: [{ id: 'cat-empty' }],
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    expect(sections.some((section) => section.kind === 'category')).toBe(false)
  })

  it('keeps a non-empty category at its declared position, between live and today', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'pinned-1', isPinned: true }),
      createConversation({ id: 'live-1', liveCall: createLiveCall() }),
      createConversation({ id: 'cat-1', categoryId: 'cat-work' }),
      createConversation({ id: 'today-1' }),
    ]

    const sections = resolveConversationSections({
      conversations,
      categories: [{ id: 'cat-work' }],
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    expect(sections.map((section) => section.kind)).toEqual(['pinned', 'live', 'category', 'today'])
  })

  it('preserves the declared order of multiple non-empty categories, skipping empty ones in between', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'friends-1', categoryId: 'cat-friends' }),
      createConversation({ id: 'family-1', categoryId: 'cat-family' }),
    ]

    const sections = resolveConversationSections({
      conversations,
      categories: [{ id: 'cat-work' }, { id: 'cat-friends' }, { id: 'cat-family' }], // work: vide
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    const categorySections = sections.filter(
      (section): section is Extract<ConversationSection, { kind: 'category' }> => section.kind === 'category'
    )
    expect(categorySections.map((section) => section.categoryId)).toEqual(['cat-friends', 'cat-family'])
  })
})

describe('resolveConversationSections — bornes calendaires du lecteur, jamais UTC', () => {
  it('classifies a message at "yesterday 23:59" in the reader timezone as yesterday, even though its UTC calendar day is today', () => {
    // Pacific/Honolulu = UTC−10, sans heure d'été.
    // now  = 2026-08-15T20:00:00Z → local Honolulu 2026-08-15 10:00 ("aujourd'hui" local)
    // conv = 2026-08-15T09:59:00Z → local Honolulu 2026-08-14 23:59 ("hier" local)
    // Les DEUX instants tombent le 15 août en UTC — un calcul UTC classerait
    // à tort la conversation en "today".
    const now = new Date('2026-08-15T20:00:00Z')
    const conversation = createConversation({
      id: 'honolulu-yesterday',
      lastMessageAt: new Date('2026-08-15T09:59:00Z'),
      updatedAt: new Date('2026-08-15T09:59:00Z'),
    })

    const sections = resolveConversationSections({
      conversations: [conversation],
      categories: [],
      now,
      locale: 'en',
      timeZone: 'Pacific/Honolulu',
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]?.kind).toBe('yesterday')
  })

  it('the very same instant classifies as today for a reader in UTC', () => {
    const now = new Date('2026-08-15T20:00:00Z')
    const conversation = createConversation({
      id: 'utc-today',
      lastMessageAt: new Date('2026-08-15T09:59:00Z'),
      updatedAt: new Date('2026-08-15T09:59:00Z'),
    })

    const sections = resolveConversationSections({
      conversations: [conversation],
      categories: [],
      now,
      locale: 'en',
      timeZone: 'UTC',
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]?.kind).toBe('today')
  })

  it('buckets today / yesterday / thisWeek / older correctly across a spread of ages', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'today', lastMessageAt: daysAgo(0), updatedAt: daysAgo(0) }),
      createConversation({ id: 'yesterday', lastMessageAt: daysAgo(1), updatedAt: daysAgo(1) }),
      createConversation({ id: 'this-week-low', lastMessageAt: daysAgo(2), updatedAt: daysAgo(2) }),
      createConversation({ id: 'this-week-high', lastMessageAt: daysAgo(6), updatedAt: daysAgo(6) }),
      createConversation({ id: 'older', lastMessageAt: daysAgo(7), updatedAt: daysAgo(7) }),
    ]

    const sections = resolveConversationSections({
      conversations,
      categories: [],
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    const kindById = new Map(sections.flatMap((section) => section.conversations.map((c) => [c.id, section.kind])))
    expect(kindById.get('today')).toBe('today')
    expect(kindById.get('yesterday')).toBe('yesterday')
    expect(kindById.get('this-week-low')).toBe('thisWeek')
    expect(kindById.get('this-week-high')).toBe('thisWeek')
    expect(kindById.get('older')).toBe('older')
  })
})

describe('sortConversations', () => {
  it('orders pinned before live before categorized before dated, unpinned/non-live/uncategorized', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'plain', lastMessageAt: daysAgo(0) }),
      createConversation({ id: 'categorized', categoryId: 'cat-1', orderInCategory: 0 }),
      createConversation({ id: 'live', liveCall: createLiveCall() }),
      createConversation({ id: 'pinned', isPinned: true }),
    ]

    const sorted = sortConversations(conversations).map((c) => c.id)
    expect(sorted).toEqual(['pinned', 'live', 'categorized', 'plain'])
  })

  it('within a category, orders by orderInCategory ascending', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'third', categoryId: 'cat-1', orderInCategory: 2 }),
      createConversation({ id: 'first', categoryId: 'cat-1', orderInCategory: 0 }),
      createConversation({ id: 'second', categoryId: 'cat-1', orderInCategory: 1 }),
    ]

    const sorted = sortConversations(conversations).map((c) => c.id)
    expect(sorted).toEqual(['first', 'second', 'third'])
  })

  it('falls back to lastMessageAt desc when orderInCategory is absent', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'old', categoryId: 'cat-1', orderInCategory: null, lastMessageAt: daysAgo(5) }),
      createConversation({ id: 'recent', categoryId: 'cat-1', orderInCategory: null, lastMessageAt: daysAgo(1) }),
    ]

    const sorted = sortConversations(conversations).map((c) => c.id)
    expect(sorted).toEqual(['recent', 'old'])
  })

  it('falls back to updatedAt when lastMessageAt is absent', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'stale-updated', lastMessageAt: null, updatedAt: daysAgo(10) }),
      createConversation({ id: 'fresh-updated', lastMessageAt: null, updatedAt: daysAgo(1) }),
    ]

    const sorted = sortConversations(conversations).map((c) => c.id)
    expect(sorted).toEqual(['fresh-updated', 'stale-updated'])
  })

  it('breaks exact ties deterministically by id, no hashValue, no seed', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'b', lastMessageAt: daysAgo(0) }),
      createConversation({ id: 'a', lastMessageAt: daysAgo(0) }),
      createConversation({ id: 'c', lastMessageAt: daysAgo(0) }),
    ]

    const sorted = sortConversations(conversations).map((c) => c.id)
    expect(sorted).toEqual(['a', 'b', 'c'])
  })

  it('is stable: three independent calls on the same input render the same order', () => {
    const conversations: readonly SectionableConversation[] = Array.from({ length: 25 }, (_, i) =>
      createConversation({
        id: `conv-${i}`,
        isPinned: i % 4 === 0,
        categoryId: i % 3 === 0 ? 'cat-1' : null,
        orderInCategory: i,
        lastMessageAt: daysAgo(i % 9),
        updatedAt: daysAgo(i % 9),
      })
    )

    const first = sortConversations(conversations).map((c) => c.id)
    const second = sortConversations(conversations).map((c) => c.id)
    const third = sortConversations(conversations).map((c) => c.id)

    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  it('does not mutate its input array', () => {
    const conversations: readonly SectionableConversation[] = [
      createConversation({ id: 'b', lastMessageAt: daysAgo(0) }),
      createConversation({ id: 'a', lastMessageAt: daysAgo(1) }),
    ]
    const snapshot = [...conversations]

    sortConversations(conversations)

    expect(conversations).toEqual(snapshot)
  })
})

describe('non-régression E11 — lastMessage.createdAt ne pilote jamais le classement', () => {
  /**
   * `SectionableConversation` n'expose délibérément AUCUN `lastMessage`
   * (voir sa documentation dans `conversation-sections.ts`) — la garde la
   * plus forte contre E11 est qu'il n'existe littéralement rien à lire par
   * erreur. Ce type local, plus large, simule le payload wire RÉEL (qui,
   * lui, porte encore `lastMessage.createdAt` à côté de `lastMessageAt`) et
   * prouve que la loi ignore ce champ même quand il est présent sur
   * l'objet.
   */
  type WireShapedConversation = SectionableConversation & {
    readonly lastMessage?: { readonly createdAt: Date }
  }

  it('sortConversations ranks by lastMessageAt, not by the more recent lastMessage.createdAt', () => {
    const staleByLastMessageAt: WireShapedConversation = {
      ...createConversation({ id: 'stale-lastMessageAt', lastMessageAt: daysAgo(30) }),
      lastMessage: { createdAt: daysAgo(0) }, // frais — un piège E11
    }
    const genuinelyRecent: WireShapedConversation = {
      ...createConversation({ id: 'genuinely-recent', lastMessageAt: daysAgo(1) }),
      lastMessage: { createdAt: daysAgo(20) }, // vieux — n'a pas d'importance
    }

    const sorted = sortConversations([staleByLastMessageAt, genuinelyRecent]).map((c) => c.id)
    expect(sorted).toEqual(['genuinely-recent', 'stale-lastMessageAt'])
  })

  it('resolveConversationSections buckets by lastMessageAt, not by the more recent lastMessage.createdAt', () => {
    const conversation: WireShapedConversation = {
      ...createConversation({ id: 'trap', lastMessageAt: daysAgo(30), updatedAt: daysAgo(30) }),
      lastMessage: { createdAt: daysAgo(0) },
    }

    const sections = resolveConversationSections({
      conversations: [conversation],
      categories: [],
      now: NOW,
      locale: 'fr',
      timeZone: 'Europe/Paris',
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]?.kind).toBe('older')
  })
})
