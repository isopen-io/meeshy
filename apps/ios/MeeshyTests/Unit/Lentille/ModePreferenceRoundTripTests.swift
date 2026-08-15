import XCTest
@testable import Meeshy

/// Aller-retour Auto ⇆ forcé sur le store (contrat LWS-8/I-072, §LWS-8
/// « Un mode forcé débraye l'orchestrateur pour cette conversation ; revenir
/// sur 🪄 Auto le réengage — vérifié par aller-retour COMPLET sur le canal
/// préférences »).
///
/// **Suite PARTIELLE, ouverte** : couvre le round-trip lui-même
/// (`LentilleModeMenuActions.select` → `LocalReadingModePreferenceStore`) et
/// sa conséquence sur la décision affichée (`LentilleReadingModeContext
/// .decision`). I-073 complète (bascule multi-appareils réelle — hors
/// périmètre du store LOCAL de M-048, qui devient un cache optimiste devant
/// le canal serveur seulement à LWS-3).
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1591`) : `ModePreferenceRoundTripTests`, phase 1
/// (nom repris tel quel du contrat §LWS-8).
final class ModePreferenceRoundTripTests: XCTestCase {

    // MARK: - Décor

    /// JAMAIS `.standard` (convention du dépôt, cf. `ProviderSubstitutionTests
    /// .withIsolatedDefaults`) : un test qui écrirait la vraie clé laisserait
    /// un résidu visible au lancement suivant, `MeeshyTests` étant hébergé
    /// dans `Meeshy.app`.
    private func withIsolatedStore(_ body: (ReadingModePreferenceStoring) async -> Void) async {
        let suiteName = "ModePreferenceRoundTripTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        let store = LocalReadingModePreferenceStore(defaults: defaults)
        await body(store)
        defaults.removePersistentDomain(forName: suiteName)
    }

    private static let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(unreadCount: Int = 999, lastReadAt: Date? = nil) -> MeeshyConversation {
        MeeshyConversation(
            id: "conv-roundtrip",
            identifier: "conv-roundtrip",
            type: .group,
            title: "Equipe Produit",
            lastMessageAt: Self.now,
            createdAt: Self.now,
            updatedAt: Self.now,
            userState: ConversationUserState(unreadCount: unreadCount, lastReadAt: lastReadAt)
        )
    }

    // MARK: - 1. Le magasin lui-même — Auto ⇆ forcé

    /// Défaut `.auto` tant que rien n'est mémorisé (M-048, contrat
    /// `ReadingModePreferenceStoring.get` : « rend la main à l'orchestrateur,
    /// jamais un mode figé par défaut »).
    func test_store_defaultsToAuto_whenNothingMemorized() async {
        await withIsolatedStore { store in
            let value = await store.get(conversationId: "never-touched")
            XCTAssertEqual(value, .auto)
        }
    }

    /// Aller : Auto → forcé (`.script`), écriture optimiste immédiate.
    func test_store_writesAForcedMode_readBackImmediately() async {
        await withIsolatedStore { store in
            await store.set(conversationId: "conv-1", value: .script, optimistic: true)
            let value = await store.get(conversationId: "conv-1")
            XCTAssertEqual(value, .script)
        }
    }

    /// Retour : forcé → Auto — PAS un no-op, `.auto` doit être RÉÉCRIT et
    /// relu, exactement comme n'importe quelle autre valeur (contrat : « un
    /// mode forcé débraye… revenir sur Auto le réengage »).
    func test_store_roundTrip_forcedBackToAuto_isWrittenAndReadBack() async {
        await withIsolatedStore { store in
            await store.set(conversationId: "conv-1", value: .resume, optimistic: true)
            XCTAssertEqual(await store.get(conversationId: "conv-1"), .resume, "Prérequis : le forçage a pris.")

            await store.set(conversationId: "conv-1", value: .auto, optimistic: true)
            XCTAssertEqual(
                await store.get(conversationId: "conv-1"), .auto,
                "Revenir sur Auto doit être un aller-retour COMPLET, pas un état qui reste " +
                "coincé sur le dernier mode forcé."
            )
        }
    }

    /// Isolation par conversation : forcer le mode d'UNE conversation ne doit
    /// jamais affecter une autre — sinon « UNE préférence » (contrat) serait
    /// vraie par accident (une seule conversation testée) plutôt que par
    /// construction (clé `(conversationId)`).
    func test_store_isolatesPreferenceByConversation() async {
        await withIsolatedStore { store in
            await store.set(conversationId: "conv-a", value: .script, optimistic: true)
            XCTAssertEqual(await store.get(conversationId: "conv-a"), .script)
            XCTAssertEqual(
                await store.get(conversationId: "conv-b"), .auto,
                "Une conversation jamais touchée ne doit RIEN hériter du forçage d'une autre."
            )
        }
    }

    // MARK: - 2. `LentilleModeMenuActions.select` — le point d'écriture partagé

    /// Les trois points d'entrée (encoche, sous-menu, aperçu) passent tous
    /// par `LentilleModeMenuActions.select` : ce témoin prouve que cette
    /// fonction ATTEINT bien le magasin injecté (pas un `.shared` figé), et
    /// que l'écriture se propage même lancée en tâche détachée (comme au
    /// site d'appel réel, `LentilleModeMenu.onSelect`).
    func test_menuActionsSelect_reachesTheInjectedStore() async {
        await withIsolatedStore { store in
            LentilleModeMenuActions.select(.script, conversationId: "conv-1", store: store)

            // `select` lance une `Task` détachée (comme au site d'appel
            // réel) : quelques cessions de l'exécuteur suffisent à la laisser
            // courir sur une écriture `UserDefaults` synchrone en pratique.
            var observed: ReadingModeOrchestrator.ReadingModePreference = .auto
            for _ in 0..<50 {
                observed = await store.get(conversationId: "conv-1")
                if observed == .script { break }
                await Task.yield()
            }
            XCTAssertEqual(observed, .script)
        }
    }

    // MARK: - 3. Conséquence sur la décision — Auto réengage l'orchestrateur

    /// Bout en bout : forcer `.script` sur une conversation dont la loi
    /// numérique rendrait `.summary` (non-lus massifs) doit quand même
    /// afficher `.script` — puis revenir à `.auto` doit RENDRE LA MAIN à la
    /// loi numérique, qui retrouve `.summary`. Un seul témoin qui prouve que
    /// « Auto réengage l'orchestrateur » n'est pas qu'une écriture de
    /// magasin isolée : c'est la DÉCISION AFFICHÉE qui doit changer.
    func test_decision_reflectsTheRoundTrip_forcedThenBackToAuto() async {
        await withIsolatedStore { store in
            let conversation = makeConversation(unreadCount: ReadingModeOrchestrator.unreadCap + 5, lastReadAt: nil)

            await store.set(conversationId: conversation.id, value: .script, optimistic: true)
            let forced = await store.get(conversationId: conversation.id)
            let forcedDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: forced, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(forcedDecision.mode, .script)
            XCTAssertEqual(forcedDecision.reason, .sticky)

            await store.set(conversationId: conversation.id, value: .auto, optimistic: true)
            let backToAuto = await store.get(conversationId: conversation.id)
            let autoDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: backToAuto, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(
                autoDecision.mode, .summary,
                "Revenu sur Auto, la loi NUMÉRIQUE doit reprendre la main — ici le plafond " +
                "de non-lus, masqué pendant que `.script` était collant."
            )
            XCTAssertEqual(autoDecision.reason, .unreadOverCap)
            XCTAssertNotEqual(
                forcedDecision.mode, autoDecision.mode,
                "Discrimination (leçon 266) : si forcé et Auto rendaient le MÊME mode ici, " +
                "ce témoin ne prouverait rien — l'écart entre `.script` (collant) et " +
                "`.summary` (numérique) est ce qui rend le round-trip visible."
            )
        }
    }
}
