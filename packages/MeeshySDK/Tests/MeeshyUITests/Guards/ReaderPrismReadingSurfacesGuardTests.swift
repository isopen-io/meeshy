import XCTest

/// **Le fil, les stories et les commentaires affichent leurs traductions par le
/// Prisme STRICT du lecteur (#11832).**
///
/// `MeeshyUser.preferredContentLanguages` ajoute un repli « fr » et ignore la
/// locale de l'appareil tant que le serveur ne l'a pas vue : il sert les DÉFAUTS
/// de composition (langue proposée au composer). Ce qui s'AFFICHE ou se JOUE lit
/// `ReaderPrism.resolve(for:)` — rangs 1 → 4, sans repli. Le lecteur de réels a
/// rejoint la règle avec #9892 ; cette garde tient les trois autres familles de
/// lecture sociale, une par une, et l'énumération elle-même (tout fichier
/// `Feed*`, `Post*`, `Story*`, `Comment*`, `MyStories*` des vues).
final class ReaderPrismReadingSurfacesGuardTests: XCTestCase {

    private static let featuresDirectory = "apps/ios/Meeshy/Features/"
    private static let strictPrism = "ReaderPrism.resolve(for:"
    private static let compositionDefaults = ["currentUser?.preferredContentLanguages", "user?.preferredContentLanguages"]
    private static let compositionMarker = "Défaut de COMPOSITION"

    /// Les seuls sites qui gardent les défauts de composition : ils PROPOSENT
    /// une langue (composer, réponse, export, document légal) et le disent.
    private static let compositionSites = [
        "Main/Views/StoryViewerView+Header.swift", "Main/Views/StoryViewerView+Sidebar.swift", "Main/Views/StoryViewerSheets.swift",
        "Main/Services/MoodSpotlight/MoodReplySender.swift", "Main/Services/NotificationActionHandler.swift",
        "Main/Views/ConversationView.swift", "Call/Views/CallDeclineSheet.swift",
        "Main/Services/StoryPhotoSaveService.swift", "Main/ViewModels/StoryExportShareViewModel.swift",
        "Settings/Views/PrivacyPolicyView.swift", "Settings/Views/TermsOfServiceView.swift",
    ]

    private static let feed = [
        "Main/Views/FeedSceneAutoplay.swift", "Main/Views/FeedPostCard.swift", "Main/Views/FeedPostEngagementState.swift",
        "Main/Views/PostDetailView+Canvas.swift", "Main/Views/PostDetailView+Presentations.swift", "Main/Views/PostDetailView+Prism.swift",
        "Main/Views/PostDetailView+RepostEmbed.swift", "Main/Views/PostTranslationSheet.swift", "Main/Services/NSEPendingPostConsumer.swift",
    ]
    private static let stories = [
        "Main/Views/StoryViewerView.swift", "Main/Views/StoryViewerView+PrefetchPipeline.swift",
        "Main/Views/StoryViewerView+Content+Comments.swift", "Main/Views/StoryCommentsOverlayHost.swift", "Main/Views/MyStoriesView.swift",
    ]
    private static let comments = [
        "Main/Views/CommentRowView.swift", "Main/Views/CommentsSheetLiveSync.swift", "Main/Views/FeedCommentsSheet.swift",
        "Main/Views/FeedCommentsSheet+Loading.swift", "Main/Views/FeedPostCard+CommentsPreview.swift",
        "Main/Views/PostDetailCommentThread.swift", "Main/Services/ThreadRepliesLoader.swift",
    ]

    /// Hors social (#11875) : ce que la liste, la recherche, le widget et les
    /// chemins d'ingestion des messages affichent ou gravent.
    private static let conversations = [
        "Main/ViewModels/ConversationIncomingMessageReconciler.swift", "Main/ViewModels/Conversation/ConversationSearchHandler.swift",
        "Main/Views/ConversationListView.swift", "Main/ViewModels/GlobalSearchViewModel.swift", "Main/Services/WidgetDataManager.swift",
        "Main/Views/WidgetPreviewView.swift", "Main/Services/NSEPendingMessageConsumer.swift", "Main/Views/RootViewComponents.swift",
        "Main/Services/LanguageProviding.swift",
    ]

    /// Les lignes de commentaire nomment la langue SERVIE (#11875) — l'aperçu
    /// du fil directement, les lignes de post et de story par la bascule
    /// partagée (#13133), dont `FeedCommentTranslationDisplayTests` prouve la règle.
    private static let commentChips = ["Main/Views/FeedPostCard+CommentsPreview.swift"]
    private static let sharedToggleRows = ["Main/Views/StoryCommentRowView.swift", "Main/Views/CommentRowView.swift"]

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Tests/MeeshyUITests/Guards
            .deletingLastPathComponent()   // .../Tests/MeeshyUITests
            .deletingLastPathComponent()   // .../Tests
            .deletingLastPathComponent()   // .../MeeshySDK
            .deletingLastPathComponent()   // .../packages
            .deletingLastPathComponent()   // racine du dépôt
    }

    private func featureSources() throws -> [URL] {
        let features = Self.repoRoot.appendingPathComponent(Self.featuresDirectory)
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: features, includingPropertiesForKeys: nil))
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func source(_ path: String) throws -> String {
        try String(contentsOf: Self.repoRoot.appendingPathComponent(Self.featuresDirectory + path), encoding: .utf8)
    }

    private func assertReadsTheStrictPrism(_ family: [String], name: String) throws {
        for path in family {
            let code = try source(path)
            XCTAssertTrue(code.contains(Self.strictPrism),
                          "\(name) — \(path) doit lire le Prisme strict du lecteur (ReaderPrism.resolve(for:))")
            for defaults in Self.compositionDefaults {
                XCTAssertFalse(code.contains(defaults),
                               "\(name) — \(path) choisit ce qu'il AFFICHE sur les défauts de composition (\(defaults))")
            }
        }
    }

    func test_feed_readsTheStrictPrism() throws {
        try assertReadsTheStrictPrism(Self.feed, name: "fil")
    }

    func test_stories_readTheStrictPrism() throws {
        try assertReadsTheStrictPrism(Self.stories, name: "stories")
    }

    func test_comments_readTheStrictPrism() throws {
        try assertReadsTheStrictPrism(Self.comments, name: "commentaires")
    }

    func test_conversationsSearchWidgetAndIngestion_readTheStrictPrism() throws {
        try assertReadsTheStrictPrism(Self.conversations, name: "conversations")
        let sync = try String(contentsOf: Self.repoRoot.appendingPathComponent(
            "packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift"), encoding: .utf8)
        XCTAssertTrue(sync.contains(Self.strictPrism), "le moteur de synchro grave les aperçus par le Prisme strict")
        XCTAssertFalse(sync.contains("currentUser?.preferredContentLanguages"))
    }

    func test_commentRows_nameTheServedLanguage_fromTheOrderedPrism() throws {
        for path in Self.commentChips {
            let code = try source(path)
            XCTAssertTrue(code.contains("servedLanguage(preferredLanguages:"),
                          "\(path) : la puce dit la langue SERVIE, pas le rang 1")
            XCTAssertFalse(code.contains("let userLang: String"),
                           "\(path) : une seule langue ne descend pas le Prisme")
        }
        for path in Self.sharedToggleRows {
            XCTAssertTrue(try source(path).contains("CommentTranslationToggle("),
                          "\(path) : la puce passe par la bascule partagée")
        }
        XCTAssertTrue(try source("Main/Components/LanguageFlagChip.swift").contains("translatedChipLanguage(readerLanguages:"),
                      "la bascule partagée nomme la langue servie")
    }

    /// Aucun site de l'app, hors composition déclarée, ne lit les défauts de
    /// composition (les fichiers `Reel*` ont leur propre garde, #9892).
    func test_noSiteOfTheApp_readsTheCompositionDefaults_outsideTheDeclaredOnes() throws {
        let offenders = try featureSources()
            .filter { !$0.lastPathComponent.hasPrefix("Reel") }
            .map { url in (path: url.path.components(separatedBy: Self.featuresDirectory).last ?? url.path, url: url) }
            .filter { !Self.compositionSites.contains($0.path) }
            .filter { try String(contentsOf: $0.url, encoding: .utf8).contains("currentUser?.preferredContentLanguages") }
            .map { $0.path }
        XCTAssertEqual(offenders, [], "ces sites lisent les défauts de composition sans le dire")
    }

    /// Les sites de COMPOSITION gardent le repli — et le disent, à la ligne.
    func test_compositionSites_keepTheDefaults_andSaySo() throws {
        for path in Self.compositionSites {
            let lines = try source(path).components(separatedBy: "\n")
            let reads = lines.indices.filter { lines[$0].contains("currentUser?.preferredContentLanguages") }
            XCTAssertFalse(reads.isEmpty, "\(path) n'amorce plus le composer depuis les défauts : retirer de la liste")
            for index in reads {
                XCTAssertTrue(lines[index].contains(Self.compositionMarker)
                              || (index > 0 && lines[index - 1].contains(Self.compositionMarker)),
                              "\(path):\(index + 1) lit les défauts de composition sans le dire")
            }
        }
    }

    /// L'énumération elle-même : un fichier de lecture sociale NOUVEAU ne
    /// réintroduit pas les défauts de composition sans passer par la liste.
    func test_noOtherSocialReadingView_readsTheCompositionDefaults() throws {
        let views = try featureSources()
            .filter { $0.deletingLastPathComponent().lastPathComponent == "Views" }
            .filter { url in ["Feed", "Post", "Story", "Comment", "MyStories"].contains { url.lastPathComponent.hasPrefix($0) } }
            .map { url in url.path.components(separatedBy: Self.featuresDirectory).last ?? url.path }
        XCTAssertGreaterThan(views.count, 100, "la garde ne voit plus les vues de lecture sociale")
        let offenders = try views
            .filter { !Self.compositionSites.contains($0) }
            .filter { path in
                let code = try source(path)
                return Self.compositionDefaults.contains { code.contains($0) }
            }
        XCTAssertEqual(offenders, [], "ces vues affichent sur les défauts de composition : ReaderPrism.resolve(for:)")
    }
}
