import XCTest
import MeeshySDK
@testable import Meeshy

/// F-086 (WS-7) — l'orchestrateur décide dans `ConversationView.init` (A6),
/// UNE SEULE FOIS. Ce fichier prouve la partie TESTABLE SANS toucher
/// `UserDefaults.standard` : `readingModeConversationType(for:)` (mapping
/// pur, nouveau).
///
/// **RE-PREUVE (I-075, second amendement 2026-08-16)** : la note historique
/// « `LentilleFeatureFlag.readingModes` vaut `OFF` tant que rien ne l'a
/// activé » N'EST PLUS VRAIE. Le drapeau cascade désormais vers
/// `BetaFeaturesPreference` (défaut ON) quand sa propre clé n'a jamais été
/// posée — sur le vrai domaine (`UserDefaults.standard` + le vrai
/// `ProcessInfo`), aucun des deux n'a jamais été écrit par ce process de
/// test, donc `MeeshyFeatureFlags.isReadingModesEnabled` (non injectable) y
/// vaut RÉELLEMENT `true` maintenant — voir `LentilleFlagGateTests`
/// (matrice complète) et `FeatureFlagGateTests
/// .test_isReadingModesEnabled_injectable_defaultsToTrue_viaBetaCascade`
/// pour la preuve injectable équivalente. Sans conséquence pour CE fichier :
/// aucun test ci-dessous ne construit `ConversationView` (raison détaillée
/// plus bas), donc rien ici ne dépendait de la valeur réelle du drapeau.
///
/// **Ce que cette suite NE reprouve PAS** : la décision « 4 branches + choix
/// collant qui PRIME + drapeau OFF » est la loi GELÉE
/// `ReadingModeOrchestrator.resolveOrchestratorDecision`
/// (`Focal/Core/ReadingModeOrchestrator.swift`, M-042) et son enveloppe
/// `ReadingModeController` (`Focal/Preferences/ReadingModeController.swift`,
/// F-080) — toutes deux déjà couvertes par leurs propres suites
/// (`FeatureFlagGateTests`, et les vecteurs `ReadingModeOrchestrator`
/// hérités de C-011/M-042). Réécrire ces branches ici dupliquerait une loi
/// déjà prouvée. Ce que WS-7 (F-086) AJOUTE et qui doit être prouvé ICI :
/// que `ConversationView.init` construit les BONNES ENTRÉES depuis
/// `Conversation`/`anonymousSession` et les transmet à `ReadingModeController`
/// SANS second calcul.
///
/// **Pourquoi pas de test flag-ON via `ConversationView` directement** :
/// `ConversationView.init` lit `MeeshyFeatureFlags.isReadingModesEnabled`
/// (non injectable, forme EXACTE du contrat §WS-7) — la forcer à `true`
/// exigerait d'écrire dans `UserDefaults.standard`, que `MeeshyTests`
/// PARTAGE avec `Meeshy.app` (résidu inter-suites documenté,
/// `ReadingModePreferenceStore.swift`). Le patron établi par F-080
/// (`FeatureFlagGateTests`) est d'injecter directement dans
/// `ReadingModeOrchestrator`/`ReadingModeController` — voir
/// `FocalHostSourceGuardTests`-style gardes ci-dessous pour la preuve de
/// CÂBLAGE (source), complément de cette preuve de COMPORTEMENT (flag off).
@MainActor
final class ConversationViewReadingModeInitTests: XCTestCase {

    // MARK: - readingModeConversationType(for:) — mapping pur, NOUVEAU (F-086)

    func test_readingModeConversationType_directMapsDirect() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .direct), .direct)
    }

    func test_readingModeConversationType_groupMapsGroup() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .group), .group)
    }

    func test_readingModeConversationType_publicMapsPublic() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .public), .public)
    }

    func test_readingModeConversationType_globalMapsGlobal() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .global), .global)
    }

    func test_readingModeConversationType_broadcastMapsBroadcast() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .broadcast), .broadcast)
    }

    /// Les trois cas ABSENTS du miroir gelé (`community`/`channel`/`bot`) —
    /// RE-PREUVE : `ReadingModeOrchestrator.ConversationType` n'a que 5 cas.
    /// Repliés sur `.group` : jamais `.direct`, seule distinction qui compte
    /// pour `resolveCapabilities` (éligibilité Rivière : « jamais en direct »).
    func test_readingModeConversationType_communityFallsBackToGroup() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .community), .group)
    }

    func test_readingModeConversationType_channelFallsBackToGroup() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .channel), .group)
    }

    func test_readingModeConversationType_botFallsBackToGroup() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: .bot), .group)
    }

    /// `nil` (aucune conversation) ⇒ `.group`, cohérent avec `isDirect`
    /// (`ConversationView.isDirect`, ci-dessus dans le fichier) qui traite
    /// déjà un `conversation` nil comme « pas direct ».
    func test_readingModeConversationType_nilFallsBackToGroup() {
        XCTAssertEqual(ConversationView.readingModeConversationType(for: nil), .group)
    }

    // MARK: - Le câblage flag-ON/sticky/OFF de `ConversationView.init`

    // NON EXERCÉ ICI, VOLONTAIREMENT (RE-PREUVE, arrêt et signalement) :
    // construire un `ConversationView` réel instancie `ConversationViewModel`,
    // qui construit `MessageStore`/`ConversationSocketHandler` contre
    // `ConversationDependencies.live` — GRDB RÉEL, aucun point d'injection
    // exposé par `ConversationView.init` pour substituer une persistance de
    // test. AUCUN test existant du dépôt ne construit `ConversationView`
    // directement (recherche source à l'ouverture de F-086) : ce serait un
    // chemin d'exécution inédit, non vérifiable sans Xcode/simulateur (R5),
    // et le risque (E/S disque réelle, effets de bord non cartographiés)
    // dépasse la valeur du test pour CE lot. Les branches 4+collant+OFF de
    // la loi elle-même restent couvertes par `FeatureFlagGateTests`
    // (F-080) sur `ReadingModeOrchestrator`/`ReadingModeController`
    // directement — ce que WS-7 (F-086) AJOUTE (le câblage des ENTRÉES) est
    // prouvé par lecture de source dans
    // `ConversationViewReadingModeSourceGuardTests.swift`, jumeau de ce
    // fichier. Point bloquant signalé au rapport final F-086.
}
