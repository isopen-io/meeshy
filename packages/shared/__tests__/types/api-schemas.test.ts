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

describe('messageSchema — storyReplyTo enriched cited-story object', () => {
  it('declares storyReplyTo so Fastify does not strip the enriched story metadata', () => {
    expect(messageSchema.properties).toHaveProperty('storyReplyTo')
  })

  it('exposes the cited-story detail fields', () => {
    const prop = (messageSchema.properties as Record<string, { properties?: Record<string, unknown> }>)
      .storyReplyTo
    expect(prop.properties).toBeDefined()
    for (const field of ['id', 'reactionCount', 'commentCount', 'createdAt', 'thumbnailUrl', 'previewText']) {
      expect(prop.properties).toHaveProperty(field)
    }
  })
})
