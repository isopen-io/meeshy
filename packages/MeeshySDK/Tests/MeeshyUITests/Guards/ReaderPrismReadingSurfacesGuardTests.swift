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

    private static let mainDirectory = "apps/ios/Meeshy/Features/Main/"
    private static let strictPrism = "ReaderPrism.resolve(for:"
    private static let compositionDefaults = ["currentUser?.preferredContentLanguages", "user?.preferredContentLanguages"]
    private static let compositionMarker = "Défaut de COMPOSITION"

    /// Les seuls sites qui gardent les défauts de composition : ils PROPOSENT
    /// une langue (composer, réponse, export, document légal) et le disent.
    private static let compositionSites = [
        "Views/StoryViewerView+Header.swift", "Views/StoryViewerView+Sidebar.swift", "Views/StoryViewerSheets.swift",
        "Services/MoodSpotlight/MoodReplySender.swift", "Services/NotificationActionHandler.swift",
        "Views/ConversationView.swift", "Views/CallDeclineSheet.swift",
        "Services/StoryPhotoSaveService.swift", "ViewModels/StoryExportShareViewModel.swift",
        "Views/PrivacyPolicyView.swift", "Views/TermsOfServiceView.swift",
    ]

    private static let feed = [
        "Views/FeedSceneAutoplay.swift", "Views/FeedPostCard.swift", "Views/FeedPostEngagementState.swift",
        "Views/PostDetailView+Canvas.swift", "Views/PostDetailView+Presentations.swift", "Views/PostDetailView+Prism.swift",
        "Views/PostDetailView+RepostEmbed.swift", "Views/PostTranslationSheet.swift", "Services/NSEPendingPostConsumer.swift",
    ]
    private static let stories = [
        "Views/StoryViewerView.swift", "Views/StoryViewerView+PrefetchPipeline.swift",
        "Views/StoryViewerView+Content+Comments.swift", "Views/StoryCommentsOverlayHost.swift", "Views/MyStoriesView.swift",
    ]
    private static let comments = [
        "Views/CommentRowView.swift", "Views/CommentsSheetLiveSync.swift", "Views/FeedCommentsSheet.swift",
        "Views/FeedCommentsSheet+Loading.swift", "Views/FeedPostCard+CommentsPreview.swift",
        "Views/PostDetailCommentThread.swift", "Services/ThreadRepliesLoader.swift",
    ]

    /// Hors social (#11875) : ce que la liste, la recherche, le widget et les
    /// chemins d'ingestion des messages affichent ou gravent.
    private static let conversations = [
        "ViewModels/ConversationIncomingMessageReconciler.swift", "ViewModels/Conversation/ConversationSearchHandler.swift",
        "Views/ConversationListView.swift", "ViewModels/GlobalSearchViewModel.swift", "Services/WidgetDataManager.swift",
        "Views/WidgetPreviewView.swift", "Services/NSEPendingMessageConsumer.swift", "Views/RootViewComponents.swift",
        "Services/LanguageProviding.swift",
    ]

    /// Les lignes de commentaire nomment la langue SERVIE (#11875) — l'aperçu
    /// du fil directement, les lignes de post et de story par la bascule
    /// partagée (#13133), dont `FeedCommentTranslationDisplayTests` prouve la règle.
    private static let commentChips = ["Views/FeedPostCard+CommentsPreview.swift"]
    private static let sharedToggleRows = ["Views/StoryCommentRowView.swift", "Views/CommentRowView.swift"]

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Tests/MeeshyUITests/Guards
            .deletingLastPathComponent()   // .../Tests/MeeshyUITests
            .deletingLastPathComponent()   // .../Tests
            .deletingLastPathComponent()   // .../MeeshySDK
            .deletingLastPathComponent()   // .../packages
            .deletingLastPathComponent()   // racine du dépôt
    }

    private func source(_ path: String) throws -> String {
        try String(contentsOf: Self.repoRoot.appendingPathComponent(Self.mainDirectory + path), encoding: .utf8)
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
        XCTAssertTrue(try source("Components/LanguageFlagChip.swift").contains("translatedChipLanguage(readerLanguages:"),
                      "la bascule partagée nomme la langue servie")
    }

    /// Aucun site de l'app, hors composition déclarée, ne lit les défauts de
    /// composition (les fichiers `Reel*` ont leur propre garde, #9892).
    func test_noSiteOfTheApp_readsTheCompositionDefaults_outsideTheDeclaredOnes() throws {
        let main = Self.repoRoot.appendingPathComponent(Self.mainDirectory)
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: main, includingPropertiesForKeys: nil))
        let offenders = try enumerator.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" && !$0.lastPathComponent.hasPrefix("Reel") }
            .map { url in (path: url.path.components(separatedBy: Self.mainDirectory).last ?? url.path, url: url) }
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
        let views = Self.repoRoot.appendingPathComponent(Self.mainDirectory + "Views")
        let names = try FileManager.default.contentsOfDirectory(atPath: views.path)
            .filter { $0.hasSuffix(".swift") }
            .filter { name in ["Feed", "Post", "Story", "Comment", "MyStories"].contains { name.hasPrefix($0) } }
        XCTAssertGreaterThan(names.count, 100, "la garde ne voit plus les vues de lecture sociale")
        let offenders = try names
            .filter { !Self.compositionSites.contains("Views/" + $0) }
            .filter { name in
                let code = try source("Views/" + name)
                return Self.compositionDefaults.contains { code.contains($0) }
            }
        XCTAssertEqual(offenders, [], "ces vues affichent sur les défauts de composition : ReaderPrism.resolve(for:)")
    }
}
