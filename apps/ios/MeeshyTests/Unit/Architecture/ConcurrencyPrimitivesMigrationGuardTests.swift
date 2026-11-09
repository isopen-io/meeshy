import XCTest

final class ConcurrencyPrimitivesMigrationGuardTests: XCTestCase {

    private struct Rule {
        let name: String
        let pattern: String
        let reason: String
    }

    private static let mutedSleep = Rule(
        name: "try-sleep",
        pattern: #"try\?\s*await\s+Task\.sleep"#,
        reason: "un sommeil muet laisse la suite s'exécuter après annulation : cancellableSleep(for:)")
    private static let nanosecondSleep = Rule(
        name: "sleep-nanoseconds",
        pattern: #"Task\.sleep\(nanoseconds:"#,
        reason: "durée typée : Task.sleep(for:) ou cancellableSleep(for:)")
    private static let artisanLock = Rule(
        name: "nslock",
        pattern: #"\bNSLock\(\)"#,
        reason: "Locked<State> garde l'état et le verrou ensemble")
    private static let unsafeIsolation = Rule(
        name: "nonisolated-unsafe",
        pattern: #"nonisolated\(unsafe\)"#,
        reason: "TaskSlot, TeardownBox ou une vraie isolation")
    private static let delayedMainQueue = Rule(
        name: "async-after",
        pattern: #"[\w)\]]\.asyncAfter\("#,
        reason: "DelayedActions meurt avec son propriétaire")

    private static let table: [(path: String, rules: [Rule])] = [
        "Vitrine/VitrineInteractionsLiens.swift",
        "Vitrine/VitrineInteractionsPost.swift",
        "Vitrine/VitrineInteractionsReel.swift",
        "Vitrine/VitrineInteractions.swift",
        "Vitrine/VitrineCommentaire.swift",
        "Vitrine/VitrineInteractionsComposeur.swift",
        "Vitrine/VitrineInteractionsEntete.swift",
        "Vitrine/VitrineJeu.swift",
        "Vitrine/VitrineReel.swift",
        "Vitrine/VitrineStage.swift",
        "Stories/Views/StoryViewerView+Canvas.swift",
        "Stories/Views/StoryGroupIntroPresenter.swift",
        "River/View/RiverStreamHost.swift",
        "Game/ProgressionConceptPage.swift",
        "Game/Choreography/MintCeremonyRun.swift",
        "Main/Components/MentionComposerController.swift",
        "Main/Components/ConversationCard/ConversationLinkCardPreviewLaunch.swift",
        "Main/Views/NearbyDensityOverlay.swift",
        "Export/MessageCardMotionExporter.swift",
    ].map { (path: $0, rules: [mutedSleep, nanosecondSleep]) } + [
        "../Core/MessageStoreRouter.swift",
        "Main/Services/EditHistoryStore.swift",
        "Main/Services/LocallyHiddenMessagesStore.swift",
        "Main/Services/ConversationProtectionPreferenceStore.swift",
        "Main/Services/BackgroundTaskManager.swift",
        "Main/Services/RecentCameraRollAssetProvider.swift",
        "Main/ViewModels/NearbyDiscoveryViewModel.swift",
        "Lens/Core/GatewayBridgeProvider.swift",
        "Lens/Core/LentilleProviders.swift",
        "Lens/Mode/LentilleReadingModeContext.swift",
        "Auth/SignInLinkOpener.swift",
        "Links/Views/ShareableLink.swift",
        "Game/Frames/GloryFrameFonts.swift",
        "Game/Photo/GamePhotoNotebook.swift",
        "Call/Services/CallColorLook.swift",
        "Main/Components/CameraPreviewLayer.swift",
        "Main/Components/ComposerCameraPreparedInputs.swift",
        "Composer/ComposerFramePacing.swift",
        "Composer/ComposerLookSceneCache.swift",
    ].map { (path: $0, rules: [artisanLock]) } + [
        "Notifications/NotificationListViewModel.swift",
        "Main/ViewModels/GlobalSearchViewModel.swift",
        "Composer/ComposerAutosaveController.swift",
        "Main/Services/PresenceManager.swift",
        "Main/ViewModels/ConversationListTypingTracker.swift",
        "Main/ViewModels/ConversationMarkedReadObserver.swift",
        "Main/Services/ThermalStateMonitor.swift",
        "Main/Services/CrashDiagnosticsManager.swift",
        "Main/Services/ConversationAudioCoordinator.swift",
        "Main/Stores/MessageStore.swift",
        "Main/Components/OverlayAudioPlayer.swift",
        "JoinFlow/JoinFlowViewModel.swift",
        "Settings/Views/PrivacySettingsView.swift",
    ].map { (path: $0, rules: [unsafeIsolation]) }

    private static var featuresRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features")
    }

    private func violations() throws -> [String] {
        try Self.table.flatMap { entry -> [String] in
            let url = Self.featuresRoot.appendingPathComponent(entry.path)
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            return try entry.rules.compactMap { rule in
                let expression = try NSRegularExpression(pattern: rule.pattern)
                let range = NSRange(source.startIndex..., in: source)
                guard expression.firstMatch(in: source, range: range) != nil else { return nil }
                return "\(entry.path) : \(rule.name) — \(rule.reason)"
            }
        }
    }

    func test_migratedFiles_carryNoArtisanalConcurrencyPrimitive() throws {
        let found = try violations()
        XCTAssertTrue(found.isEmpty, found.joined(separator: "\n"))
    }
}
