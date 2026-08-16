import XCTest
import MeeshySDK
@testable import Meeshy

/// Aller-retour Auto ⇆ forcé sur le store (contrat LWS-8/I-072, §LWS-8
/// « Un mode forcé débraye l'orchestrateur pour cette conversation ; revenir
/// sur 🪄 Auto le réengage — vérifié par aller-retour COMPLET sur le canal
/// préférences »).
///
/// **Suite COMPLÉTÉE par I-073** : couvre le round-trip lui-même
/// (`LentilleModeMenuActions.select` → `LocalReadingModePreferenceStore`) et
/// sa conséquence sur la décision affichée (`LentilleReadingModeContext
/// .decision`). La bascule multi-appareils réelle reste hors périmètre du
/// store LOCAL de M-048, qui devient un cache optimiste devant le canal
/// serveur seulement à LWS-3.
///
/// **I-073 ajoute** : les deux branches manquantes de
/// `resolveOrchestratorDecision` traversées bout en bout (`.staleAbsence`,
/// `.default` — les quatre branches non-`flagDisabled` sont désormais
/// toutes couvertes par ce fichier), et une re-preuve d'ancrage documentant
/// que « séparation par (scope, conversationId) » n'est PAS un fait
/// testable sur le store M-048 que LWS-8 possède réellement (aucune notion
/// de `scope` sur ce protocole — voir §4 ci-dessous, qui pointe vers la
/// collision de nom non résolue documentée par `LentilleProviders.swift`).
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
            let forced = await store.get(conversationId: "conv-1")
            XCTAssertEqual(forced, .resume, "Prérequis : le forçage a pris.")

            await store.set(conversationId: "conv-1", value: .auto, optimistic: true)
            let backToAuto = await store.get(conversationId: "conv-1")
            XCTAssertEqual(
                backToAuto, .auto,
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
            let conversationA = await store.get(conversationId: "conv-a")
            XCTAssertEqual(conversationA, .script)
            let conversationB = await store.get(conversationId: "conv-b")
            XCTAssertEqual(
                conversationB, .auto,
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

    /// I-073 — même round-trip, branche `.staleAbsence` de
    /// `resolveOrchestratorDecision` (§ table du contrat, branche 4 : absence
    /// ET `unreadCount >= 10`). Avec le test précédent (branche 2 `.sticky` et
    /// branche 3 `.unreadOverCap`) et le suivant (branche 5 `.default`), les
    /// QUATRE branches non-`flagDisabled` sont désormais toutes traversées
    /// bout en bout via `LentilleReadingModeContext.decision` — la
    /// cinquième, `.flagDisabled`, est hors de propos ici : le menu de mode
    /// n'existe pas drapeau éteint (aucun des trois points d'entrée n'est
    /// monté, `ModeMenuModelTests`/`+Overlays.swift`).
    func test_decision_reflectsTheRoundTrip_forcedThenBackToAuto_staleAbsenceBranch() async {
        await withIsolatedStore { store in
            // `unreadCount` dans [absenceUnreadFloor, unreadCap] (10…25) et
            // `lastReadAt = nil` (jamais ouverte ⇒ absence VRAIE dès la
            // première condition d'`isReaderAbsent`, sans même consulter la
            // fenêtre de 24 h) : la seule combinaison qui active la branche 4
            // sans passer par la branche 3 (`unreadOverCap`, qui sature au-delà
            // de 25 et masquerait celle-ci).
            let conversation = makeConversation(unreadCount: 15, lastReadAt: nil)

            await store.set(conversationId: conversation.id, value: .focal, optimistic: true)
            let forced = await store.get(conversationId: conversation.id)
            let forcedDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: forced, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(forcedDecision.mode, .focal)
            XCTAssertEqual(forcedDecision.reason, .sticky)

            await store.set(conversationId: conversation.id, value: .auto, optimistic: true)
            let backToAuto = await store.get(conversationId: conversation.id)
            let autoDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: backToAuto, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(
                autoDecision.mode, .summary,
                "Revenu sur Auto, un lecteur absent avec ≥10 non-lus doit retrouver le " +
                "Résumé Vivant — la branche « absence » de l'orchestrateur, masquée pendant " +
                "que `.focal` était collant."
            )
            XCTAssertEqual(
                autoDecision.reason, .staleAbsence,
                "La RAISON doit distinguer cette branche de `.unreadOverCap` : même mode " +
                "rendu (`.summary`), motif différent — l'encoche « AUTO · Résumé » reste " +
                "identique dans les deux cas, mais un futur libellé de raison (hors " +
                "périmètre LWS-8) doit pouvoir les distinguer."
            )
            XCTAssertNotEqual(forcedDecision.mode, autoDecision.mode)
        }
    }

    /// I-073 — branche `.default` (§ branche 5, repli `.focal` numérique) :
    /// aucun forçage, aucun non-lu massif, aucune absence — l'orchestrateur
    /// rend son repli de base. Complète la matrice des quatre branches
    /// atteignables drapeau ON avec le test précédent et celui du haut de ce
    /// fichier.
    func test_decision_reflectsTheRoundTrip_forcedThenBackToAuto_defaultBranch() async {
        await withIsolatedStore { store in
            // `unreadCount = 0` : sous le plancher d'absence (10) ET sous le
            // plafond (25) — les branches 3 et 4 sont donc structurellement
            // hors jeu, quelle que soit `lastReadAt`. `lastReadAt = Self.now`
            // documente quand même une lecture récente : la branche par
            // défaut n'a besoin d'AUCUNE des deux conditions numériques, pas
            // seulement de l'absence d'un forçage.
            let conversation = makeConversation(unreadCount: 0, lastReadAt: Self.now)

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
                autoDecision.mode, .focal,
                "Revenu sur Auto sans aucun signal numérique, l'orchestrateur retombe sur " +
                "son repli de base — `.focal`, le plancher de la loi (§ commentaire " +
                "`clampFallbackMode`)."
            )
            XCTAssertEqual(autoDecision.reason, .default)
            XCTAssertNotEqual(
                forcedDecision.mode, autoDecision.mode,
                "Discrimination : `.script` forcé vs `.focal` par défaut — un round-trip qui " +
                "rendrait `.focal` dans les DEUX états ne prouverait rien (leçon 266)."
            )
        }
    }

    // MARK: - 4. « Scope » — anchor re-proved, PAS testable dans ce périmètre

    /// I-073 : la mission demande une séparation par « (scope, conversationId)
    /// — deux conversations, deux scopes ». Re-preuve d'ancrage (§0) : le
    /// magasin que LWS-8 possède réellement (`LocalReadingModePreferenceStore`,
    /// M-048, `Lentille/Core/LentilleProviders.swift`) ne connaît QU'UNE clé,
    /// `conversationId` — `test_store_isolatesPreferenceByConversation`
    /// ci-dessus en est le témoin. Aucune notion de « scope » n'existe sur ce
    /// protocole aujourd'hui.
    ///
    /// Un SECOND protocole, de MÊME NOM `ReadingModePreferenceStoring` mais de
    /// forme différente — clé `(conversationId, scope)`, synchrone, `AnyObject`
    /// — est décrit par `focal-implementation-contract.md` §WS-1 (F-080,
    /// `Focal/Core/ReadingModePreferenceStoring.swift`). Ce fichier N'EXISTE
    /// PAS ENCORE dans ce worktree (vérifié ci-dessous) : la collision de nom
    /// que `LentilleProviders.swift` documente lui-même (« l'arbitrage du nom
    /// entre les deux revient à Fable à l'intégration V3 ») reste non résolue.
    /// Tant qu'elle l'est, « deux scopes » n'est un fait testable NULLE PART
    /// dans le graphe de dépendances de LWS-8 — ce témoin verrouille
    /// l'ABSENCE du concept côté M-048 plutôt que d'inventer un paramètre que
    /// le store réel ne porte pas.
    ///
    /// DÉFAUT/AMBIGUÏTÉ RÉEL DOCUMENTÉ, NON CORRIGÉ : rapporté tel quel, la
    /// résolution appartenant à Fable (arbitrage explicitement délégué par le
    /// commentaire source), pas à cette micro-tâche de tests.
    func test_scopeConversationIdSeparation_isNotYetAConceptOnTheM048StoreLWS8Owns() throws {
        let providersCode = try String(
            contentsOf: Self.iosRoot.appendingPathComponent(
                "Meeshy/Features/Main/Lentille/Core/LentilleProviders.swift"
            ),
            encoding: .utf8
        )
        let normalizedProviders = AppSourceGuard.stripComments(providersCode)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        XCTAssertTrue(
            normalizedProviders.contains("func get(conversationId: String) async -> ReadingModePreference"),
            "Le protocole M-048 doit garder sa signature à un seul paramètre — c'est " +
            "l'ancrage que ce témoin re-prouve avant de conclure à l'absence de `scope`."
        )
        XCTAssertEqual(
            normalizedProviders.components(separatedBy: "scope").count - 1, 0,
            "« scope » apparaît dans le CODE (hors commentaires) de `LentilleProviders.swift` " +
            "— soit le protocole M-048 a gagné un paramètre de portée sans que ce témoin " +
            "(et le commentaire de collision qu'il re-prouve) ait été mis à jour, soit la " +
            "collision documentée avec F-080 vient d'être résolue autrement : dans les deux " +
            "cas, ce test doit être relu avant d'être simplement rendu vert."
        )

        let focalReadingModeStoreExists = FileManager.default.fileExists(
            atPath: Self.iosRoot.appendingPathComponent(
                "Meeshy/Features/Main/Focal/Core/ReadingModePreferenceStoring.swift"
            ).path
        )
        XCTAssertFalse(
            focalReadingModeStoreExists,
            "`Focal/Core/ReadingModePreferenceStoring.swift` (F-080, protocole `(conversationId, " +
            "scope)`) existe désormais : la collision de nom que `LentilleProviders.swift` " +
            "signale comme NON résolue a été tranchée (ou a atterri sans être tranchée — un " +
            "conflit de redéclaration romprait alors la compilation du module `Meeshy`). Ce " +
            "témoin doit être mis à jour ou retiré une fois l'arbitrage de Fable connu ; " +
            "« deux scopes » redevient alors un fait testable, ce qu'il n'est pas aujourd'hui."
        )
    }

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }
}
