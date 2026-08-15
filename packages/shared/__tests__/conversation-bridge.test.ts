/**
 * Tests du pont ✦ — étage déterministe (LWS-1, C-019/C-020).
 * @see tasks/lentille-implementation-contract.md §3.2, écart E7
 */
import { describe, it, expect } from 'vitest'
import {
  buildBridgeData,
  formatBridge,
  type BridgeMessage,
  type BridgeTranslate,
} from '../utils/conversation-bridge'
import type { ConversationBridgeData } from '../types/conversation-bridge.js'

const VIEWER_ID = 'viewer-1'

const createMessage = (overrides: Partial<BridgeMessage> = {}): BridgeMessage => ({
  senderId: 'author-1',
  senderName: 'Alice',
  ...overrides,
})

/**
 * Deux `t` factices de langues différentes, pour la preuve E7 : même `data`,
 * deux catalogues, deux phrases. Chaque catalogue interpole ses paramètres
 * indépendamment — aucune connaissance partagée de la langue.
 */
const createFrenchT = (): BridgeTranslate => (key, params) => {
  const catalog: Record<string, string> = {
    'lentille.bridge.authorsOne': `${params?.name}`,
    'lentille.bridge.authorsTwo': `${params?.a} et ${params?.b}`,
    'lentille.bridge.authorsMore': `${params?.a}, ${params?.b} +${params?.count}`,
    'lentille.bridge.messages': `${params?.count} messages`,
    'lentille.bridge.media.images': `${params?.count} images`,
    'lentille.bridge.media.audio': `${params?.count} vocaux`,
    'lentille.bridge.media.files': `${params?.count} fichiers`,
  }
  const template = catalog[key]
  if (!template) throw new Error(`missing key: ${key}`)
  return template
}

const createEnglishT = (): BridgeTranslate => (key, params) => {
  const catalog: Record<string, string> = {
    'lentille.bridge.authorsOne': `${params?.name}`,
    'lentille.bridge.authorsTwo': `${params?.a} and ${params?.b}`,
    'lentille.bridge.authorsMore': `${params?.a}, ${params?.b} +${params?.count}`,
    'lentille.bridge.messages': `${params?.count} messages`,
    'lentille.bridge.media.images': `${params?.count} images`,
    'lentille.bridge.media.audio': `${params?.count} voice notes`,
    'lentille.bridge.media.files': `${params?.count} files`,
  }
  const template = catalog[key]
  if (!template) throw new Error(`missing key: ${key}`)
  return template
}

describe('buildBridgeData', () => {
  it('returns null when unreadCount is zero, never an empty bridge', () => {
    const result = buildBridgeData({
      messages: [createMessage()],
      viewerId: VIEWER_ID,
      unreadCount: 0,
    })
    expect(result).toBeNull()
  })

  it('excludes the viewer own messages from author list and messageCount', () => {
    const result = buildBridgeData({
      messages: [
        createMessage({ senderId: VIEWER_ID, senderName: 'Moi' }),
        createMessage({ senderId: 'author-1', senderName: 'Alice' }),
        createMessage({ senderId: VIEWER_ID, senderName: 'Moi' }),
      ],
      viewerId: VIEWER_ID,
      unreadCount: 3,
    })
    expect(result).toEqual<ConversationBridgeData>({
      authors: ['Alice'],
      extraAuthorCount: 0,
      messageCount: 1,
    })
  })

  it('names at most two authors, in order of first appearance', () => {
    const result = buildBridgeData({
      messages: [
        createMessage({ senderId: 'author-1', senderName: 'Alice' }),
        createMessage({ senderId: 'author-2', senderName: 'Bob' }),
      ],
      viewerId: VIEWER_ID,
      unreadCount: 2,
    })
    expect(result?.authors).toEqual(['Alice', 'Bob'])
    expect(result?.extraAuthorCount).toBe(0)
  })

  it('rolls a third distinct author into extraAuthorCount = 1', () => {
    const result = buildBridgeData({
      messages: [
        createMessage({ senderId: 'author-1', senderName: 'Alice' }),
        createMessage({ senderId: 'author-2', senderName: 'Bob' }),
        createMessage({ senderId: 'author-3', senderName: 'Chloé' }),
      ],
      viewerId: VIEWER_ID,
      unreadCount: 3,
    })
    expect(result?.authors).toEqual(['Alice', 'Bob'])
    expect(result?.extraAuthorCount).toBe(1)
    expect(result?.messageCount).toBe(3)
  })

  it('dedupes authors by senderId, not by displayed name', () => {
    const result = buildBridgeData({
      messages: [
        createMessage({ senderId: 'author-1', senderName: 'Alice' }),
        createMessage({ senderId: 'author-1', senderName: 'Alice' }),
        createMessage({ senderId: 'author-2', senderName: 'Alice' }),
      ],
      viewerId: VIEWER_ID,
      unreadCount: 3,
    })
    // Deux comptes différents partageant le même nom affiché comptent comme
    // deux auteurs distincts — la déduplication porte sur l'identité, pas le nom.
    expect(result?.authors).toEqual(['Alice', 'Alice'])
    expect(result?.extraAuthorCount).toBe(0)
    expect(result?.messageCount).toBe(3)
  })

  it('counts media by real attachment kind, images and audio isolated', () => {
    const result = buildBridgeData({
      messages: [
        createMessage({
          attachments: [{ type: 'image' }, { type: 'image' }, { type: 'audio' }],
        }),
        createMessage({
          senderId: 'author-2',
          senderName: 'Bob',
          attachments: [{ type: 'file' }],
        }),
      ],
      viewerId: VIEWER_ID,
      unreadCount: 2,
    })
    expect(result?.mediaCounts).toEqual({ images: 2, audio: 1, files: 1 })
  })

  it('buckets video and location attachments into files (only three buckets exist), images/audio ABSENT since zero (réserve 10)', () => {
    const result = buildBridgeData({
      messages: [
        createMessage({
          attachments: [{ type: 'video' }, { type: 'location' }, { type: 'file' }],
        }),
      ],
      viewerId: VIEWER_ID,
      unreadCount: 1,
    })
    expect(result?.mediaCounts).toEqual({ files: 3 })
    expect(result?.mediaCounts).not.toHaveProperty('images')
    expect(result?.mediaCounts).not.toHaveProperty('audio')
  })

  it('omits mediaCounts entirely when no message carries an attachment (réserve 10 — absent, not zero)', () => {
    const result = buildBridgeData({
      messages: [createMessage()],
      viewerId: VIEWER_ID,
      unreadCount: 1,
    })
    expect(result?.mediaCounts).toBeUndefined()
    expect(result).not.toHaveProperty('mediaCounts')
  })

  it('BLOCAGE 5 — returns null (not an empty-authors bridge) when unreadCount > 0 but every message is the viewer own', () => {
    const result = buildBridgeData({
      messages: [createMessage({ senderId: VIEWER_ID, senderName: 'Moi' })],
      viewerId: VIEWER_ID,
      unreadCount: 1,
    })
    expect(result).toBeNull()
  })

  it('BLOCAGE 5 — returns null when fromOthers is empty even with several viewer-only messages', () => {
    const result = buildBridgeData({
      messages: [
        createMessage({ senderId: VIEWER_ID, senderName: 'Moi' }),
        createMessage({ senderId: VIEWER_ID, senderName: 'Moi' }),
      ],
      viewerId: VIEWER_ID,
      unreadCount: 2,
    })
    expect(result).toBeNull()
  })
})

describe('formatBridge', () => {
  it('formats a single named author', () => {
    const data: ConversationBridgeData = {
      authors: ['Alice'],
      extraAuthorCount: 0,
      messageCount: 3,
      mediaCounts: { images: 0, audio: 0, files: 0 },
    }
    expect(formatBridge(data, createFrenchT())).toBe('Alice · 3 messages')
  })

  it('formats two named authors', () => {
    const data: ConversationBridgeData = {
      authors: ['Alice', 'Bob'],
      extraAuthorCount: 0,
      messageCount: 5,
      mediaCounts: { images: 0, audio: 0, files: 0 },
    }
    expect(formatBridge(data, createFrenchT())).toBe('Alice et Bob · 5 messages')
  })

  it('formats two named authors plus the +N overflow', () => {
    const data: ConversationBridgeData = {
      authors: ['Alice', 'Bob'],
      extraAuthorCount: 1,
      messageCount: 3,
      mediaCounts: { images: 0, audio: 0, files: 0 },
    }
    expect(formatBridge(data, createFrenchT())).toBe('Alice, Bob +1 · 3 messages')
  })

  it('appends media parts only for kinds with a positive count', () => {
    const data: ConversationBridgeData = {
      authors: ['Alice'],
      extraAuthorCount: 0,
      messageCount: 4,
      mediaCounts: { images: 2, audio: 0, files: 1 },
    }
    expect(formatBridge(data, createFrenchT())).toBe('Alice · 4 messages · 2 images, 1 fichiers')
  })

  it('omits the media segment entirely when mediaCounts is absent', () => {
    const data: ConversationBridgeData = {
      authors: ['Alice'],
      extraAuthorCount: 0,
      messageCount: 1,
    }
    expect(formatBridge(data, createFrenchT())).toBe('Alice · 1 messages')
  })

  it('E7 — the same data formatted through two different-language t renders two different sentences', () => {
    const data: ConversationBridgeData = {
      authors: ['Alice', 'Bob'],
      extraAuthorCount: 1,
      messageCount: 6,
      mediaCounts: { images: 0, audio: 2, files: 0 },
    }
    const frenchSentence = formatBridge(data, createFrenchT())
    const englishSentence = formatBridge(data, createEnglishT())

    expect(frenchSentence).toBe('Alice, Bob +1 · 6 messages · 2 vocaux')
    expect(englishSentence).toBe('Alice, Bob +1 · 6 messages · 2 voice notes')
    expect(frenchSentence).not.toBe(englishSentence)
  })

  it('produces an empty string for a fully empty bridge (no author, no messages, no media)', () => {
    const data: ConversationBridgeData = {
      authors: [],
      extraAuthorCount: 0,
      messageCount: 0,
    }
    expect(formatBridge(data, createFrenchT())).toBe('')
  })
})
