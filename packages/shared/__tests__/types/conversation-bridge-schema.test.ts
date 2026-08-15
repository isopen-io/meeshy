import { describe, it, expect } from 'vitest'
import {
  ConversationBridgeDataSchema,
  ConversationBridgeSchema,
  ConversationLiveCallSchema,
} from '../../types/conversation-bridge'

function makeBridgeData(overrides: Record<string, unknown> = {}) {
  return {
    authors: ['Alice', 'Bob'],
    extraAuthorCount: 3,
    messageCount: 12,
    ...overrides,
  }
}

describe('ConversationBridgeDataSchema', () => {
  it('round-trips a valid payload with two authors and no media', () => {
    const input = makeBridgeData()
    const result = ConversationBridgeDataSchema.parse(input)
    expect(result).toEqual(input)
  })

  it('round-trips a valid payload with mediaCounts', () => {
    const input = makeBridgeData({ mediaCounts: { images: 2, audio: 1, files: 0 } })
    const result = ConversationBridgeDataSchema.parse(input)
    expect(result).toEqual(input)
  })

  it('accepts fewer than two authors', () => {
    expect(ConversationBridgeDataSchema.parse(makeBridgeData({ authors: ['Alice'] })).authors).toEqual(['Alice'])
    expect(ConversationBridgeDataSchema.parse(makeBridgeData({ authors: [] })).authors).toEqual([])
  })

  it('rejects a third author', () => {
    expect(() =>
      ConversationBridgeDataSchema.parse(makeBridgeData({ authors: ['Alice', 'Bob', 'Carol'] })),
    ).toThrow()
  })

  it('rejects a negative messageCount or extraAuthorCount', () => {
    expect(() => ConversationBridgeDataSchema.parse(makeBridgeData({ messageCount: -1 }))).toThrow()
    expect(() => ConversationBridgeDataSchema.parse(makeBridgeData({ extraAuthorCount: -1 }))).toThrow()
  })
})

function makeFallbackBridge(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'fallback' as const,
    unreadCount: 4,
    suggestedMode: 'resume' as const,
    data: makeBridgeData(),
    ...overrides,
  }
}

function makeAgentBridge(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'agent' as const,
    unreadCount: 4,
    suggestedMode: 'focal' as const,
    text: 'Alice a partagé trois photos.',
    ...overrides,
  }
}

describe('ConversationBridgeSchema', () => {
  it('round-trips a valid fallback bridge (data present, no text)', () => {
    const input = makeFallbackBridge()
    expect(ConversationBridgeSchema.parse(input)).toEqual(input)
  })

  it('round-trips a valid agent bridge (text present, translations + originalLanguage)', () => {
    const input = makeAgentBridge({
      translations: { en: 'Alice shared three photos.', es: 'Alice compartió tres fotos.' },
      originalLanguage: 'fr',
    })
    expect(ConversationBridgeSchema.parse(input)).toEqual(input)
  })

  it('rejects a negative unreadCount', () => {
    expect(() => ConversationBridgeSchema.parse(makeFallbackBridge({ unreadCount: -1 }))).toThrow()
  })

  it('rejects a non-integer unreadCount', () => {
    expect(() => ConversationBridgeSchema.parse(makeFallbackBridge({ unreadCount: 1.5 }))).toThrow()
  })

  it('rejects kind "agent" without text', () => {
    const invalid = makeAgentBridge()
    delete (invalid as Record<string, unknown>).text
    const result = ConversationBridgeSchema.safeParse(invalid)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'text')).toBe(true)
    }
  })

  it('rejects kind "fallback" without data', () => {
    const invalid = makeFallbackBridge()
    delete (invalid as Record<string, unknown>).data
    const result = ConversationBridgeSchema.safeParse(invalid)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'data')).toBe(true)
    }
  })

  it('rejects a suggestedMode outside the enumeration', () => {
    expect(() => ConversationBridgeSchema.parse(makeFallbackBridge({ suggestedMode: 'summary' }))).toThrow()
  })

  it('rejects a kind outside the enumeration', () => {
    expect(() => ConversationBridgeSchema.parse(makeFallbackBridge({ kind: 'deterministic' }))).toThrow()
  })

  // BLOCAGE 6 — la partialité voyage SUR le pont, jusqu'au rang.
  describe('isComplete — la fenêtre de calcul du producteur', () => {
    it('est optionnel : un pont sans le champ reste valide et le champ reste absent', () => {
      const parsed = ConversationBridgeSchema.parse(makeFallbackBridge())
      expect(parsed.isComplete).toBeUndefined()
    })

    it('round-trips isComplete: false (fenêtre partielle — « sur les N derniers messages »)', () => {
      const input = makeFallbackBridge({ isComplete: false })
      expect(ConversationBridgeSchema.parse(input)).toEqual(input)
    })

    it('round-trips isComplete: true sur un pont agent', () => {
      const input = makeAgentBridge({ isComplete: true })
      expect(ConversationBridgeSchema.parse(input)).toEqual(input)
    })

    it('rejects a non-boolean isComplete', () => {
      expect(() => ConversationBridgeSchema.parse(makeFallbackBridge({ isComplete: 'partial' }))).toThrow()
    })
  })
})

describe('ConversationLiveCallSchema', () => {
  it('round-trips a valid payload', () => {
    const input = {
      voices: 3,
      startedAt: new Date('2026-08-15T12:00:00.000Z').toISOString(),
      joined: false,
    }
    expect(ConversationLiveCallSchema.parse(input)).toEqual(input)
  })

  it('rejects a non-ISO startedAt', () => {
    expect(() =>
      ConversationLiveCallSchema.parse({ voices: 2, startedAt: '15/08/2026 12:00', joined: true }),
    ).toThrow()
  })

  it('rejects a negative voices count', () => {
    expect(() =>
      ConversationLiveCallSchema.parse({ voices: -1, startedAt: new Date().toISOString(), joined: true }),
    ).toThrow()
  })
})
