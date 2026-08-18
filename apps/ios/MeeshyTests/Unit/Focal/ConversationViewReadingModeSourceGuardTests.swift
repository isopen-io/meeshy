import XCTest
@testable import Meeshy

/// F-086 (WS-7) — preuves de CÂBLAGE par lecture de source, jumelles des
/// preuves comportementales de `ConversationViewReadingModeInitTests`
/// (celle-ci couvre ce qu'un test d'exécution ne peut pas couvrir sans
/// construire un `ConversationView` réel — voir la note de ce fichier sur
/// le risque GRDB/réseau non vérifiable ici, R5).
///
/// Patron « garde de source » du dossier (lecture stripped, F-085).
final class ConversationViewReadingModeSourceGuardTests: XCTestCase {

    private func hostRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func source(_ fileName: String) throws -> String {
        try String(contentsOf: hostRoot().appendingPathComponent(fileName), encoding: .utf8)
    }

    private func strippedSource(_ fileName: String) throws -> String {
        AppSourceGuard.stripComments(try source(fileName))
    }

    // MARK: - « Le mode ne change jamais sous vos doigts » (contrat §WS-7, critère §7 « Réversibilité »)

    /// Le contrat cite littéralement `ReadingModeOrchestrator.decide` — RE-PREUVE :
    /// ce symbole N'EXISTE PAS sur la loi gelée réelle (`resolveOrchestratorDecision`,
    /// appelée UNE fois depuis `ReadingModeController.init`, lui-même gelé
    /// F-080). L'équivalent fonctionnel exact — « la décision se prend UNE
    /// fois, à l'ouverture » — se prouve en comptant les constructions de
    /// `ReadingModeController(` dans `ConversationView.swift` : exactement 1,
    /// dans `init`.
    func test_readingModeControllerIsConstructedExactlyOnce_inInit() throws {
        let code = try strippedSource("ConversationView.swift")
        let occurrences = code.components(separatedBy: "ReadingModeController(").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "`ReadingModeController(` doit être construit EXACTEMENT une fois dans ConversationView.swift, dans `init` — la décision de mode ne doit jamais être reprise ailleurs (contrat §WS-7, « le mode ne change jamais sous vos doigts »)."
        )
        guard let range = code.range(of: "init(conversation: Conversation?"),
              let ctorRange = code.range(of: "ReadingModeController(", range: range.upperBound..<code.endIndex)
        else {
            XCTFail("`ReadingModeController(` introuvable APRÈS le début de `init` — la décision doit être prise dans `ConversationView.init` (A6), jamais dans `body`/`onAppear`.")
            return
        }
        _ = ctorRange
    }

    // MARK: - Résolution : identité + capacités AVANT le contrôleur

    func test_init_resolvesIdentityAndCapabilities_beforeConstructingController() throws {
        let code = try strippedSource("ConversationView.swift")
        guard let identityRange = code.range(of: "ConversationViewerIdentityResolver.resolve("),
              let capabilitiesRange = code.range(of: "ReadingModeOrchestrator.resolveCapabilities("),
              let controllerRange = code.range(of: "ReadingModeController(")
        else {
            XCTFail("Un des trois appels (identité, capacités, contrôleur) est introuvable dans ConversationView.swift.")
            return
        }
        XCTAssertTrue(identityRange.upperBound < controllerRange.lowerBound,
                      "L'identité du lecteur doit être résolue AVANT la construction du contrôleur — §5.1 : ConversationViewerIdentityResolver est l'UNIQUE point de branchement invité/inscrit.")
        XCTAssertTrue(capabilitiesRange.upperBound < controllerRange.lowerBound,
                      "Les capacités doivent être résolues AVANT la construction du contrôleur — le catalogue borne la décision (REV-1, blocage 3).")
    }

    /// `unreadCount` de la décision est le MÊME champ que celui déjà lu pour
    /// `ConversationViewModel` — pas une seconde source de vérité.
    func test_unreadCount_readsTheSameSDKFieldAsTheViewModel() throws {
        let code = try strippedSource("ConversationView.swift")
        let occurrences = code.components(separatedBy: "conversation?.userState.unreadCount ?? 0").count - 1
        XCTAssertGreaterThanOrEqual(
            occurrences, 2,
            "`conversation?.userState.unreadCount ?? 0` doit apparaître au moins deux fois — une pour `ConversationViewModel`, une pour `ReadingModeController` — la MÊME expression, jamais une seconde résolution divergente."
        )
    }

    /// `isFlagEnabled` est lu UNE fois puis réutilisé (capacités + contrôleur)
    /// — jamais deux appels indépendants à `MeeshyFeatureFlags.isReadingModesEnabled`
    /// qui pourraient (en théorie) diverger entre deux lectures.
    func test_isFlagEnabled_readOnceAndReused() throws {
        let code = try strippedSource("ConversationView.swift")
        let occurrences = code.components(separatedBy: "MeeshyFeatureFlags.isReadingModesEnabled").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "`MeeshyFeatureFlags.isReadingModesEnabled` doit être lu UNE SEULE fois dans ConversationView.swift, dans une constante réutilisée par `resolveCapabilities` ET `ReadingModeController` — jamais deux lectures indépendantes."
        )
    }

    // MARK: - Le mode décidé ATTEINT réellement l'hôte (WS-6)

    /// Sans ce câblage, la décision de l'orchestrateur serait prise pour
    /// rien. RETRAIT FOCAL iOS (2026-08-18) : `hasReachedOldest` et
    /// `isReduceMotionEnabled` sont partis avec le pass — seule la prop
    /// `readingMode` subsiste.
    func test_messageListView_receivesTheDecidedReadingMode() throws {
        let code = try strippedSource("ConversationView.swift")
        XCTAssertTrue(
            code.contains("readingMode: readingModeController.mode"),
            "MessageListView(...) doit recevoir `readingMode: readingModeController.mode` — sinon la décision de l'orchestrateur (§WS-7) n'atteint jamais l'hôte de défilement."
        )
    }

    // MARK: - Le mux de rangée (WS-6, F-086 « le mux de cellule se fait là »)

    func test_messageListViewController_mountsTheFocalRowMux() throws {
        let code = try strippedSource("MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("self.readingMode.usesFlatRow"),
            "Le mux de rangée doit brancher sur `readingMode.usesFlatRow` (.focal ET .script) — contrat §WS-6 travail 2."
        )
        XCTAssertTrue(
            code.contains("EquatableFocalRow(row: FocalRow(input: focalInput, actions: focalActions))"),
            "Le mux doit construire `EquatableFocalRow(row: FocalRow(input:actions:))` — la rangée figée WS-4, jamais réécrite ici."
        )
        XCTAssertTrue(
            code.contains("focalRow.equatable()"),
            "La rangée mux doit passer par `.equatable()` — même gate de re-render que `EquatableMessageBubble` (contrat WS-4 : le gate ne se pose jamais sur `FocalRow` lui-même)."
        )
    }

    /// Script = même FocalRow, densité `.script`. RETRAIT FOCAL iOS
    /// (2026-08-18) : `usesPerspective` et le pass sont supprimés — zéro
    /// perspective par construction. Ici : la densité TRANSMISE à
    /// `FocalRowInput` bascule bien sur `readingMode`.
    func test_focalRowInput_densityTracksReadingMode() throws {
        let code = try strippedSource("MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("density: self.readingMode == .script ? .script : .focal"),
            "FocalRowInput.density doit être `.script` en mode Script, `.focal` sinon — sinon Script rendrait avec la densité Focal par erreur."
        )
    }

    /// Flag off / mode `.summary`/`.river`/`.bubbles` : `focalRow` reste
    /// `nil`, la bulle historique gouverne — AUCUNE construction de
    /// `FocalRowInput`/`BubbleContent` supplémentaire sur ce chemin (garde
    /// de coût, contrat §WS-6 « bit-à-bit identique »).
    func test_focalRowMux_isGuardedByIf_notUnconditional() throws {
        let code = try strippedSource("MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("let focalRow: EquatableFocalRow?\n            if self.readingMode.usesFlatRow {"),
            "La construction de `focalRow` doit vivre SOUS un `if self.readingMode.usesFlatRow`, jamais inconditionnelle — sinon `.bubbles` (flag OFF) paierait le coût de `BubbleContent`/`FocalRowInput` pour rien (contrat §WS-6)."
        )
        XCTAssertTrue(
            code.contains("} else {\n                focalRow = nil\n            }"),
            "Le chemin `else` doit poser `focalRow = nil` explicitement — la bulle historique gouverne dès que `readingMode` n'est pas Focal/Script."
        )
    }
}
