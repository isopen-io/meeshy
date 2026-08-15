/**
 * Substitution de providers (R19, REV-2 réserve R1) — jumeau TS de
 * `ProviderSubstitutionTests.swift` : un consommateur écrit contre le
 * protocole gelé `ConversationBridgeProviding` ne voit AUCUNE différence
 * quand l'injection bascule d'une implémentation à une autre qui rend les
 * mêmes données. C'est le critère qui rend `GatewayBridgeProvider` (G-124)
 * branchable sans toucher une ligne d'UI.
 *
 * Ce test est aussi la protection anti-récidive du blocker 1 de REV-2 : le
 * consommateur passe un `unreadCount` autoritaire qui DIVERGE de la
 * couverture du cache — une implémentation qui relirait un second compteur
 * (le défaut corrigé) rendrait un pont différent du substitut de référence
 * et casserait l'égalité assertée ici.
 *
 * @see apps/ios/MeeshyTests/Unit/Lentille/ProviderSubstitutionTests.swift
 * @see tasks/lentille-implementation-contract.md R19
 */
import { describe, it, expect } from 'vitest'
import { LocalBridgeProvider } from '../../providers/local/LocalBridgeProvider.js'
import { formatBridge, type BridgeMessage } from '../../utils/conversation-bridge.js'
import type { ConversationBridge } from '../../types/conversation-bridge.js'
import type {
  ConversationBridgeInput,
  ConversationBridgeProviding,
} from '../../providers/ConversationBridgeProviding.js'

const MESSAGES: readonly BridgeMessage[] = [
  { senderId: 'u1', senderName: 'Awa' },
  { senderId: 'u2', senderName: 'Bintou' },
  { senderId: 'u1', senderName: 'Awa' },
]

const INPUT: ConversationBridgeInput = {
  conversationId: 'conv-1',
  viewerId: 'viewer',
  unreadCount: 30,
}

/** Consommateur agnostique : ne connaît QUE le protocole, jamais l'impl. */
async function renderBridgeLine(provider: ConversationBridgeProviding): Promise<string | null> {
  const bridge = await provider.bridgeFor(INPUT)
  if (bridge === null || bridge.data === undefined) return null
  return `${bridge.suggestedMode}#${bridge.unreadCount}: ${formatBridge(bridge.data, (key, params) =>
    `${key}(${Object.entries(params ?? {}).map(([k, v]) => `${k}=${v}`).join(',')})`,
  )}`
}

class StubBridgeProvider implements ConversationBridgeProviding {
  constructor(private readonly bridge: ConversationBridge | null) {}
  async bridgeFor(_input: ConversationBridgeInput): Promise<ConversationBridge | null> {
    return this.bridge
  }
}

describe('substitution de ConversationBridgeProviding (R19)', () => {
  it('basculer LocalBridgeProvider → stub rendant les mêmes données ne change RIEN au rendu', async () => {
    const local = new LocalBridgeProvider({
      getCachedMessages: () => MESSAGES,
      getUnreadWindow: () => ({ windowCoversUnread: true }),
    })
    const reference = await local.bridgeFor(INPUT)
    expect(reference).not.toBeNull()

    const substituted = new StubBridgeProvider(reference)

    expect(await renderBridgeLine(substituted)).toBe(await renderBridgeLine(local))
  })

  it('le consommateur suit le provider injecté, jamais une lecture parallèle (bridge nul ⇒ rien)', async () => {
    expect(await renderBridgeLine(new StubBridgeProvider(null))).toBeNull()
  })

  it('anti-récidive blocker 1 : unreadCount appelant (30) ≠ couverture cache (3) ⇒ le pont de référence porte 30', async () => {
    const local = new LocalBridgeProvider({
      getCachedMessages: () => MESSAGES,
      getUnreadWindow: () => ({ windowCoversUnread: true }),
    })

    const line = await renderBridgeLine(local)

    expect(line).not.toBeNull()
    expect(line).toContain('resume#30')
  })
})
