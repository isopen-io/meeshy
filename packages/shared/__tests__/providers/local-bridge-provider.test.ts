/**
 * `LocalBridgeProvider` (M-047, substitut client de `ConversationBridgeProviding`)
 * — REJOUE les vecteurs de `buildBridgeData` (`bridge.vectors.json`, LWS-1)
 * À TRAVERS le provider, critère explicite du contrat LWS-2bis : « le mock
 * passe les MÊMES vecteurs que le vrai ». Fenêtre complète
 * (`windowCoversUnread: true`) ⇒ `data` STRICTEMENT identique à ce que rend
 * la loi directement (`bridge.vectors.test.ts`), `isComplete` absent.
 *
 * Complète les cas hors vecteurs : fenêtre partielle ⇒ `isComplete: false`,
 * fenêtre inconnue ⇒ `null` (zéro donnée fabriquée), messages inconnus ⇒
 * `null`, et la frontière `suggestedMode` reproduite depuis
 * `ORCHESTRATOR_UNREAD_CAP` (branche par défaut de `resolveOrchestratorDecision`).
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis
 * @see packages/shared/fixtures/reading-modes/bridge.vectors.json
 */
import { describe, it, expect } from 'vitest'
import {
  LocalBridgeProvider,
  type LocalBridgeCacheReading,
  type LocalBridgeUnreadWindow,
} from '../../providers/local/LocalBridgeProvider.js'
import { ORCHESTRATOR_UNREAD_CAP } from '../../utils/reading-modes.js'
import type { BridgeMessage } from '../../utils/conversation-bridge.js'
import type { ConversationBridgeData } from '../../types/conversation-bridge.js'
import { loadVectors } from '../vectors/harness.js'

type BridgeVectorInput = {
  readonly messages: readonly BridgeMessage[]
  readonly viewerId: string
  readonly unreadCount: number
}

function makeProvider(
  messages: readonly BridgeMessage[] | null,
  window: LocalBridgeUnreadWindow | null,
): LocalBridgeProvider {
  const cache: LocalBridgeCacheReading = {
    getCachedMessages: () => messages,
    getUnreadWindow: () => window,
  }
  return new LocalBridgeProvider(cache)
}

describe('LocalBridgeProvider — vecteurs bridge.vectors.json rejoués via le provider', () => {
  const vectors = loadVectors<BridgeVectorInput, ConversationBridgeData | null>('bridge')

  vectors.forEach((vector, index) => {
    it(`case ${index} — fenêtre complète ⇒ même data que la loi`, async () => {
      const provider = makeProvider(vector.input.messages, {
        unreadCount: vector.input.unreadCount,
        windowCoversUnread: true,
      })

      const result = await provider.bridgeFor({
        conversationId: 'conv-vector',
        viewerId: vector.input.viewerId,
        unreadCount: vector.input.unreadCount,
      })

      if (vector.expected === null) {
        expect(result).toBeNull()
        return
      }

      expect(result).not.toBeNull()
      expect(result?.kind).toBe('fallback')
      expect(result?.data).toEqual(vector.expected)
      expect(result?.unreadCount).toBe(vector.input.unreadCount)
      expect(result?.isComplete).toBeUndefined()
      expect(result?.suggestedMode).toBe(
        vector.input.unreadCount <= ORCHESTRATOR_UNREAD_CAP ? 'focal' : 'resume',
      )
    })
  })
})

describe('LocalBridgeProvider — fenêtres et zéro donnée fabriquée', () => {
  it('fenêtre partielle (windowCoversUnread: false) ⇒ isComplete: false SUR le pont', async () => {
    const messages: readonly BridgeMessage[] = [{ senderId: 'u1', senderName: 'Alice' }]
    const provider = makeProvider(messages, { unreadCount: 4, windowCoversUnread: false })

    const result = await provider.bridgeFor({ conversationId: 'conv-1', viewerId: 'viewer', unreadCount: 4 })

    expect(result).not.toBeNull()
    expect(result?.isComplete).toBe(false)
    expect(result?.data).toEqual({ authors: ['Alice'], extraAuthorCount: 0, messageCount: 1 })
  })

  it('fenêtre non lue inconnue (getUnreadWindow ⇒ null) ⇒ provider rend null', async () => {
    const provider = makeProvider([{ senderId: 'u1', senderName: 'Alice' }], null)

    const result = await provider.bridgeFor({ conversationId: 'conv-1', viewerId: 'viewer', unreadCount: 4 })

    expect(result).toBeNull()
  })

  it('messages en cache inconnus (getCachedMessages ⇒ null) ⇒ provider rend null', async () => {
    const provider = makeProvider(null, { unreadCount: 4, windowCoversUnread: true })

    const result = await provider.bridgeFor({ conversationId: 'conv-1', viewerId: 'viewer', unreadCount: 4 })

    expect(result).toBeNull()
  })

  it(`unreadCount 26 (> ORCHESTRATOR_UNREAD_CAP = ${ORCHESTRATOR_UNREAD_CAP}) ⇒ suggestedMode 'resume'`, async () => {
    const messages: readonly BridgeMessage[] = [{ senderId: 'u1', senderName: 'Alice' }]
    const provider = makeProvider(messages, { unreadCount: 26, windowCoversUnread: true })

    const result = await provider.bridgeFor({ conversationId: 'conv-1', viewerId: 'viewer', unreadCount: 26 })

    expect(result?.suggestedMode).toBe('resume')
  })

  it(`unreadCount ${ORCHESTRATOR_UNREAD_CAP} (== ORCHESTRATOR_UNREAD_CAP, frontière basse) ⇒ suggestedMode 'focal'`, async () => {
    const messages: readonly BridgeMessage[] = [{ senderId: 'u1', senderName: 'Alice' }]
    const provider = makeProvider(messages, {
      unreadCount: ORCHESTRATOR_UNREAD_CAP,
      windowCoversUnread: true,
    })

    const result = await provider.bridgeFor({
      conversationId: 'conv-1',
      viewerId: 'viewer',
      unreadCount: ORCHESTRATOR_UNREAD_CAP,
    })

    expect(result?.suggestedMode).toBe('focal')
  })
})
