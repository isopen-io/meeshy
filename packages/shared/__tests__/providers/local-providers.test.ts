/**
 * Conformité des trois substituts locaux (M-047, LWS-2bis) aux protocoles
 * gelés `providers/*.ts` : `LocalBridgeProvider` (couvert en détail par
 * `local-bridge-provider.test.ts`, rejeu des vecteurs), et ici
 * `LocalReadingModePreferenceStore` + `LocalLiveCallProvider` — typage,
 * défaut `'auto'`, persistance via adaptateur injecté, `onChange`/
 * désabonnement idempotent, et la garde source « zéro requête réseau »
 * partagée par les trois fichiers.
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { LocalBridgeProvider } from '../../providers/local/LocalBridgeProvider.js'
import {
  LocalReadingModePreferenceStore,
  type LocalReadingModePreferencePersisting,
} from '../../providers/local/LocalReadingModePreferenceStore.js'
import { LocalLiveCallProvider } from '../../providers/local/LocalLiveCallProvider.js'
import type { ConversationBridgeProviding } from '../../providers/ConversationBridgeProviding.js'
import type { ReadingModePreferenceStoring } from '../../providers/ReadingModePreferenceStoring.js'
import type { ConversationLiveCallProviding } from '../../providers/ConversationLiveCallProviding.js'
import type { ConversationLiveCall } from '../../types/conversation-bridge.js'

describe('conformité de typage — les trois substituts implémentent leur protocole gelé', () => {
  it('LocalBridgeProvider satisfait ConversationBridgeProviding', () => {
    const provider: ConversationBridgeProviding = new LocalBridgeProvider({
      getCachedMessages: () => null,
      getUnreadWindow: () => null,
    })
    expect(typeof provider.bridgeFor).toBe('function')
  })

  it('LocalReadingModePreferenceStore satisfait ReadingModePreferenceStoring', () => {
    const store: ReadingModePreferenceStoring = new LocalReadingModePreferenceStore()
    expect(typeof store.get).toBe('function')
    expect(typeof store.set).toBe('function')
    expect(typeof store.onChange).toBe('function')
  })

  it('LocalLiveCallProvider satisfait ConversationLiveCallProviding', () => {
    const provider: ConversationLiveCallProviding = new LocalLiveCallProvider()
    expect(typeof provider.liveCallFor).toBe('function')
    expect(typeof provider.onChange).toBe('function')
  })
})

describe('LocalReadingModePreferenceStore', () => {
  it("get() rend 'auto' par défaut quand rien n'est mémorisé, sans adaptateur", async () => {
    const store = new LocalReadingModePreferenceStore()
    await expect(store.get({ conversationId: 'conv-1' })).resolves.toBe('auto')
  })

  it("get() rend 'auto' par défaut quand l'adaptateur ne connaît rien non plus", async () => {
    const persistence: LocalReadingModePreferencePersisting = { read: () => null, write: vi.fn() }
    const store = new LocalReadingModePreferenceStore(persistence)
    await expect(store.get({ conversationId: 'conv-1' })).resolves.toBe('auto')
  })

  it('set() écrit dans la Map en mémoire ET pousse à travers l\'adaptateur de persistance', async () => {
    const written = new Map<string, string>()
    const persistence: LocalReadingModePreferencePersisting = {
      read: (key) => written.get(key) ?? null,
      write: (key, value) => written.set(key, value),
    }
    const store = new LocalReadingModePreferenceStore(persistence)

    await store.set({ conversationId: 'conv-1' }, 'script')

    expect(written.get('conv-1')).toBe('script')
    await expect(store.get({ conversationId: 'conv-1' })).resolves.toBe('script')
  })

  it("get() relit depuis l'adaptateur quand rien n'est encore en mémoire (nouvelle instance)", async () => {
    const written = new Map<string, string>([['conv-1', 'riviere']])
    const persistence: LocalReadingModePreferencePersisting = {
      read: (key) => written.get(key) ?? null,
      write: (key, value) => written.set(key, value),
    }
    const store = new LocalReadingModePreferenceStore(persistence)

    await expect(store.get({ conversationId: 'conv-1' })).resolves.toBe('riviere')
  })

  it('une valeur persistée invalide (hors énum) ne fait pas planter get() — replie sur auto', async () => {
    const persistence: LocalReadingModePreferencePersisting = {
      read: () => 'not-a-valid-preference',
      write: vi.fn(),
    }
    const store = new LocalReadingModePreferenceStore(persistence)

    await expect(store.get({ conversationId: 'conv-1' })).resolves.toBe('auto')
  })

  it('onChange notifie les écritures et le désabonnement est idempotent', async () => {
    const store = new LocalReadingModePreferenceStore()
    const listener = vi.fn()
    const unsubscribe = store.onChange(listener)

    await store.set({ conversationId: 'conv-1' }, 'focal')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ conversationId: 'conv-1' }, 'focal')

    unsubscribe()
    unsubscribe() // idempotent : un second appel ne lève pas

    await store.set({ conversationId: 'conv-1' }, 'resume')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('LocalLiveCallProvider', () => {
  it('liveCallFor() rend null pour un appel inconnu — jamais inventé', () => {
    const provider = new LocalLiveCallProvider()
    expect(provider.liveCallFor('conv-unknown')).toBeNull()
  })

  it('noteLiveCall() enregistre puis liveCallFor() le restitue', () => {
    const provider = new LocalLiveCallProvider()
    const liveCall: ConversationLiveCall = {
      voices: 2,
      startedAt: new Date('2026-08-15T12:00:00.000Z').toISOString(),
      joined: true,
    }

    provider.noteLiveCall('conv-1', liveCall)

    expect(provider.liveCallFor('conv-1')).toEqual(liveCall)
    expect(provider.liveCallFor('conv-2')).toBeNull()
  })

  it('noteLiveCall(id, null) efface un appel précédemment noté', () => {
    const provider = new LocalLiveCallProvider()
    const liveCall: ConversationLiveCall = {
      voices: 1,
      startedAt: new Date('2026-08-15T12:00:00.000Z').toISOString(),
      joined: false,
    }

    provider.noteLiveCall('conv-1', liveCall)
    provider.noteLiveCall('conv-1', null)

    expect(provider.liveCallFor('conv-1')).toBeNull()
  })

  it('onChange notifie les changements et le désabonnement est idempotent', () => {
    const provider = new LocalLiveCallProvider()
    const listener = vi.fn()
    const unsubscribe = provider.onChange(listener)

    const liveCall: ConversationLiveCall = {
      voices: 1,
      startedAt: new Date('2026-08-15T12:00:00.000Z').toISOString(),
      joined: false,
    }
    provider.noteLiveCall('conv-1', liveCall)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('conv-1', liveCall)

    unsubscribe()
    unsubscribe() // idempotent : un second appel ne lève pas

    provider.noteLiveCall('conv-1', null)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('garde source — zéro requête réseau dans les substituts locaux', () => {
  const localProvidersDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'providers', 'local')
  const sourceFiles = [
    'LocalBridgeProvider.ts',
    'LocalReadingModePreferenceStore.ts',
    'LocalLiveCallProvider.ts',
  ]

  const forbiddenNetworkTokens = [/\bfetch\s*\(/, /\baxios\b/i, /\bAPIClient\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/]

  sourceFiles.forEach((fileName) => {
    it(`${fileName} ne monte aucun import ni appel réseau (fetch/axios/APIClient/XHR/WebSocket)`, () => {
      const source = readFileSync(join(localProvidersDir, fileName), 'utf-8')

      forbiddenNetworkTokens.forEach((pattern) => {
        expect(source).not.toMatch(pattern)
      })
    })
  })
})
