/**
 * Test de COMPILATION comportementale pour les trois protocoles de
 * providers gelés en LWS-2bis (C-028).
 *
 * But : figer les signatures. Chaque interface reçoit ici un double
 * minimal, écrit dans le test lui-même — aucune implémentation réelle
 * (`LocalBridgeProvider`, `GatewayBridgeProvider`, etc. arrivent en
 * M-047 / G-124). Si une signature change de façon incompatible, ce
 * fichier cesse de compiler ou l'une des assertions ci-dessous échoue.
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis
 */
import { describe, it, expect, vi } from 'vitest'
import type {
  ConversationBridgeProviding,
  ConversationBridgeInput,
} from '../../providers/ConversationBridgeProviding.js'
import type {
  ReadingModePreferenceStoring,
  ReadingModePreferenceScope,
} from '../../providers/ReadingModePreferenceStoring.js'
import type { ConversationLiveCallProviding } from '../../providers/ConversationLiveCallProviding.js'
import type { ConversationBridge, ConversationLiveCall } from '../../types/conversation-bridge.js'
import type { ReadingModePreference } from '../../types/reading-modes.js'

/**
 * Double minimal de `ConversationBridgeProviding`. Se comporte comme un
 * substitut honnête : rend `null` quand rien n'est enregistré pour la
 * conversation, sinon le pont enregistré — jamais un pont fabriqué. La
 * partialité de la fenêtre voyage SUR le pont (`bridge.isComplete`), plus
 * dans une enveloppe de retour (REV-1, blocage 6).
 */
class TestBridgeProvider implements ConversationBridgeProviding {
  constructor(private readonly byConversation: Map<string, ConversationBridge>) {}

  async bridgeFor(input: ConversationBridgeInput): Promise<ConversationBridge | null> {
    return this.byConversation.get(input.conversationId) ?? null
  }
}

/**
 * Double minimal de `ReadingModePreferenceStoring`. Store en mémoire,
 * clé `(scope, conversationId)`, défaut `'auto'`.
 */
class TestPreferenceStore implements ReadingModePreferenceStoring {
  private readonly values = new Map<string, ReadingModePreference>()
  private readonly listeners = new Set<(scope: ReadingModePreferenceScope, value: ReadingModePreference) => void>()

  async get(scope: ReadingModePreferenceScope): Promise<ReadingModePreference> {
    return this.values.get(scope.conversationId) ?? 'auto'
  }

  async set(
    scope: ReadingModePreferenceScope,
    value: ReadingModePreference,
    _opts?: { optimistic?: boolean },
  ): Promise<void> {
    this.values.set(scope.conversationId, value)
    this.listeners.forEach((listener) => listener(scope, value))
  }

  onChange(cb: (scope: ReadingModePreferenceScope, value: ReadingModePreference) => void): () => void {
    this.listeners.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) {
        return
      }
      unsubscribed = true
      this.listeners.delete(cb)
    }
  }
}

/**
 * Double minimal de `ConversationLiveCallProviding`. Un appel inconnu
 * rend `null` — jamais inventé.
 */
class TestLiveCallProvider implements ConversationLiveCallProviding {
  private readonly calls = new Map<string, ConversationLiveCall>()
  private readonly listeners = new Set<(conversationId: string, liveCall: ConversationLiveCall | null) => void>()

  setCall(conversationId: string, liveCall: ConversationLiveCall | null): void {
    if (liveCall === null) {
      this.calls.delete(conversationId)
    } else {
      this.calls.set(conversationId, liveCall)
    }
    this.listeners.forEach((listener) => listener(conversationId, liveCall))
  }

  liveCallFor(conversationId: string): ConversationLiveCall | null {
    return this.calls.get(conversationId) ?? null
  }

  onChange(cb: (conversationId: string, liveCall: ConversationLiveCall | null) => void): () => void {
    this.listeners.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) {
        return
      }
      unsubscribed = true
      this.listeners.delete(cb)
    }
  }
}

function makeBridge(overrides: Partial<ConversationBridge> = {}): ConversationBridge {
  return {
    kind: 'fallback',
    unreadCount: 4,
    suggestedMode: 'resume',
    data: {
      authors: ['Alice', 'Bob'],
      extraAuthorCount: 1,
      messageCount: 4,
    },
    ...overrides,
  }
}

describe('ConversationBridgeProviding', () => {
  it('rend null quand rien à montrer pour la conversation', async () => {
    const provider = new TestBridgeProvider(new Map())
    const result = await provider.bridgeFor({
      conversationId: 'conv-1',
      viewerId: 'user-1',
      unreadCount: 4,
    })
    expect(result).toBeNull()
  })

  it("porte isComplete: false SUR le pont quand la fenêtre ne couvre pas tout l'intervalle non lu", async () => {
    const provider = new TestBridgeProvider(
      new Map([['conv-1', makeBridge({ unreadCount: 12, isComplete: false })]]),
    )
    const result = await provider.bridgeFor({
      conversationId: 'conv-1',
      viewerId: 'user-1',
      unreadCount: 12,
    })
    expect(result).not.toBeNull()
    expect(result?.isComplete).toBe(false)
    expect(result?.unreadCount).toBe(12)
  })

  it('laisse isComplete absent quand la fenêtre couvre tout (absent = complet)', async () => {
    const provider = new TestBridgeProvider(new Map([['conv-1', makeBridge({ unreadCount: 4 })]]))
    const result = await provider.bridgeFor({
      conversationId: 'conv-1',
      viewerId: 'user-1',
      unreadCount: 4,
    })
    expect(result?.isComplete).toBeUndefined()
  })
})

describe('ReadingModePreferenceStoring', () => {
  it("rend 'auto' par défaut quand rien n'est mémorisé", async () => {
    const store = new TestPreferenceStore()
    await expect(store.get({ conversationId: 'conv-1' })).resolves.toBe('auto')
  })

  it('mémorise par (scope, conversationId)', async () => {
    const store = new TestPreferenceStore()
    await store.set({ conversationId: 'conv-1' }, 'focal')
    await store.set({ conversationId: 'conv-2' }, 'riviere', { optimistic: true })

    await expect(store.get({ conversationId: 'conv-1' })).resolves.toBe('focal')
    await expect(store.get({ conversationId: 'conv-2' })).resolves.toBe('riviere')
  })

  it('onChange notifie les écritures et le désabonnement est idempotent', async () => {
    const store = new TestPreferenceStore()
    const listener = vi.fn()
    const unsubscribe = store.onChange(listener)

    await store.set({ conversationId: 'conv-1' }, 'script')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ conversationId: 'conv-1' }, 'script')

    unsubscribe()
    unsubscribe() // idempotent : un second appel ne lève pas

    // `'resume'` — le mot du MENU (`ReadingModePreference`), pas `'summary'`,
    // qui est le mode RENDU (`ConversationReadingMode`). Le store mémorise un
    // choix d'utilisateur, jamais une décision d'orchestrateur.
    await store.set({ conversationId: 'conv-1' }, 'resume')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('ConversationLiveCallProviding', () => {
  it('rend null pour un appel inconnu — jamais inventé', () => {
    const provider = new TestLiveCallProvider()
    expect(provider.liveCallFor('conv-unknown')).toBeNull()
  })

  it('rend le call connu pour la conversation ouverte', () => {
    const provider = new TestLiveCallProvider()
    const liveCall: ConversationLiveCall = {
      voices: 2,
      startedAt: new Date('2026-08-15T12:00:00.000Z').toISOString(),
      joined: true,
    }
    provider.setCall('conv-1', liveCall)
    expect(provider.liveCallFor('conv-1')).toEqual(liveCall)
    expect(provider.liveCallFor('conv-2')).toBeNull()
  })

  it('onChange notifie les changements et le désabonnement est idempotent', () => {
    const provider = new TestLiveCallProvider()
    const listener = vi.fn()
    const unsubscribe = provider.onChange(listener)

    const liveCall: ConversationLiveCall = {
      voices: 1,
      startedAt: new Date('2026-08-15T12:00:00.000Z').toISOString(),
      joined: false,
    }
    provider.setCall('conv-1', liveCall)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('conv-1', liveCall)

    unsubscribe()
    unsubscribe() // idempotent : un second appel ne lève pas

    provider.setCall('conv-1', null)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
