import { describe, it, expect } from 'vitest'
import { messageSchema } from '../../types/api-schemas'

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
