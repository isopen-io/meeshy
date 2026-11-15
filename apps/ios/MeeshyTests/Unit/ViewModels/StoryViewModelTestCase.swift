import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// Fixtures partagées des suites de `StoryViewModel` : le modèle de vue et ses
/// doublures, remis à neuf à chaque test, et les fabriques de stories et de pages.
@MainActor
class StoryViewModelTestCase: XCTestCase {
    var sut: StoryViewModel!
    var mockStoryService: MockStoryService!
    var mockPostService: MockPostService!
    var mockSocket: MockSocialSocket!
    var mockAPI: MockAPIClientForApp!
    var cancellables: Set<AnyCancellable>!

    /// Suite jetable : cette suite publie une dizaine de fois, et
    /// `UserDefaults.standard` est celui de l'app hôte — la préférence
    /// d'audience écrite ici serait le défaut du composer au lancement suivant.
    var defaultsSuiteName: String!
    var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        // `publishStoryInBackground` branches on the LIVE `NetworkMonitor.shared.isOffline`
        // (not injected). The simulator's real network state is non-deterministic, so when
        // it reports offline these tests take the enqueue branch that never sets
        // `activeUpload` and flake. Force the singleton online and flush the async state
        // update onto the main queue before the test body runs.
        NetworkMonitor.shared.simulateOnline()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        cancellables = []
        defaultsSuiteName = "StoryViewModelTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuiteName)
        sut = StoryViewModel(
            storyService: mockStoryService,
            postService: mockPostService,
            socialSocket: mockSocket,
            api: mockAPI,
            visibilityStore: StoryVisibilityPreferenceStore(defaults: defaults)
        )
    }

    override func tearDown() async throws {
        // Cette suite publie : sans purge, la queue de publication, les dossiers
        // médias hors-ligne et le cache du tray restent VISIBLES dans l'app au
        // lancement suivant (leçon `reference_outbox_db_path_and_test_residue`).
        await StoryPublishFixtureCleanup.purge(sut, defaults: defaults)
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        defaults = nil
        defaultsSuiteName = nil
        cancellables = nil
        sut = nil
        mockStoryService = nil
        mockPostService = nil
        mockSocket = nil
        mockAPI = nil
        try await super.tearDown()
    }

    // MARK: - Factory Helpers

    static func makeStoryAPIPost(
        id: String = "story-1",
        content: String? = "Story content",
        authorId: String = "author-1",
        authorUsername: String = "alice",
        createdAt: String = "2026-01-15T12:00:00.000Z",
        expiresAt: String? = "2026-01-16T09:00:00.000Z",
        commentCount: Int? = nil,
        referenceAccess: ReferenceAccess? = nil
    ) -> APIPost {
        let expiresAtJSON = expiresAt.map { "\"\($0)\"" } ?? "null"
        let contentJSON = content.map { "\"\($0)\"" } ?? "null"
        let commentCountJSON = commentCount.map { ", \"commentCount\": \($0)" } ?? ""
        let referenceAccessJSON = referenceAccess.map { ", \"referenceAccess\": \"\($0.rawValue)\"" } ?? ""
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": \(contentJSON),
            "createdAt": "\(createdAt)",
            "expiresAt": \(expiresAtJSON),
            "author": {"id": "\(authorId)", "username": "\(authorUsername)"}\(commentCountJSON)\(referenceAccessJSON)
        }
        """)
    }

    static func makeStoriesResponse(
        posts: [APIPost]
    ) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode("""
        {"success":true,"data":\(storyPostsJSON(posts)),"pagination":null,"error":null}
        """)
    }

    /// Expiry hors d'atteinte de l'horloge du runner : le chemin delta purge les
    /// stories périmées, donc un fixture daté du passé disparaîtrait avant
    /// l'assertion — et une date « aujourd'hui + n » ferait dépendre le témoin
    /// de la date d'exécution.
    static let farFutureExpiry = "2099-01-01T00:00:00.000Z"

    /// Page de tray complète : `pagination` + `meta`, les deux blocs que le
    /// drain lit. `makeStoriesResponse` ci-dessus reste la forme sans pagination
    /// (ce que rendait un serveur d'avant ces champs).
    static func makeStoriesPage(
        posts: [APIPost] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil,
        deletedStoryIds: [String] = [],
        deletedStoryIdsTruncated: Bool = false
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON = nextCursor.map { "\"\($0)\"" } ?? "null"
        let deletedJSON = deletedStoryIds.map { "\"\($0)\"" }.joined(separator: ",")
        return JSONStub.decode("""
        {"success":true,"data":\(storyPostsJSON(posts)),\
        "pagination":{"limit":50,"hasMore":\(hasMore),"nextCursor":\(cursorJSON)},\
        "error":null,\
        "meta":{"deletedStoryIds":[\(deletedJSON)],"deletedStoryIdsTruncated":\(deletedStoryIdsTruncated)}}
        """)
    }

    static func storyPostsJSON(_ posts: [APIPost]) -> String {
        let items = posts.map { p in
            let contentJSON = p.content.map { "\"\($0)\"" } ?? "null"
            let expiresAtJSON: String
            if let e = p.expiresAt {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                expiresAtJSON = "\"\(formatter.string(from: e))\""
            } else {
                expiresAtJSON = "null"
            }
            let createdAtFormatter = ISO8601DateFormatter()
            createdAtFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let createdAtStr = createdAtFormatter.string(from: p.createdAt)
            return """
            {"id":"\(p.id)","type":"STORY","content":\(contentJSON),"createdAt":"\(createdAtStr)","expiresAt":\(expiresAtJSON),"author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
            """
        }
        return "[\(items.joined(separator: ","))]"
    }

    func makeStoryGroup(
        userId: String = "user-1",
        username: String = "alice",
        stories: [StoryItem] = []
    ) -> StoryGroup {
        StoryGroup(
            id: userId,
            username: username,
            avatarColor: "FF2E63",
            stories: stories.isEmpty ? [makeStoryItem()] : stories
        )
    }

    func makeStoryItem(
        id: String = "item-1",
        content: String? = "Test story",
        isViewed: Bool = false,
        createdAt: Date = Date(),
        updatedAt: Date? = nil
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: [],
            storyEffects: nil,
            createdAt: createdAt,
            expiresAt: createdAt.addingTimeInterval(72000),
            isViewed: isViewed,
            updatedAt: updatedAt
        )
    }

    // MARK: - Purge des stories mortes

    //
    // Le merge delta est additif : il ne peut RIEN retirer. Une story supprimée
    // pendant que l'app était fermée ou hors-ligne (event socket `story:deleted`
    // manqué, aucun replay) restait donc dans le tray — illisible, puisque le
    // lecteur la saute ou tombe sur des médias 404, et indéboulonnable jusqu'à
    // l'expiration du cache 24 h. Deux canaux la font maintenant sortir : les
    // tombstones du serveur (`meta.deletedStoryIds`) et le filtre d'expiry local.

    static func makeDeltaResponse(deletedStoryIds: [String] = []) -> PaginatedAPIResponse<[APIPost]> {
        let ids = deletedStoryIds.map { "\"\($0)\"" }.joined(separator: ",")
        return JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null,"meta":{"deletedStoryIds":[\(ids)]}}
        """)
    }

    // MARK: - R5 offline replay : pin plan + wiring

    func makeMediaStoryItem(id: String = "pin-item",
                                    videoURL: String? = "https://cdn.test/clip.mp4",
                                    audioURL: String? = "https://cdn.test/voice.m4a",
                                    imageURL: String? = "https://cdn.test/photo.jpg",
                                    expiresAt: Date = Date().addingTimeInterval(3600)) -> StoryItem {
        var media: [FeedMedia] = []
        if let videoURL {
            media.append(FeedMedia(id: "m-video", type: .video, url: videoURL, duration: 5))
        }
        if let audioURL {
            media.append(FeedMedia(id: "m-audio", type: .audio, url: audioURL, duration: 5))
        }
        if let imageURL {
            media.append(FeedMedia(id: "m-image", type: .image, url: imageURL))
        }
        return StoryItem(
            id: id,
            content: nil,
            media: media,
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: expiresAt,
            isViewed: false
        )
    }

    // MARK: - R4 inc.2 : fetch unitaire par postId (story hors tray)

    static func isoDate(offset: TimeInterval) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date().addingTimeInterval(offset))
    }

    // MARK: - R8 inc.1 : delta-sync du refetch silencieux

    static func makeDeltaResponse(postsJSON: String) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode("""
        {"success":true,"data":[\(postsJSON)],"pagination":null,"error":null}
        """)
    }

    /// Horodatage ISO8601 RELATIF à maintenant.
    ///
    /// Ces fixtures portaient des dates absolues (`expiresAt: 2026-07-05`). Une
    /// fois cette date passée, les stories du delta arrivaient déjà expirées et
    /// la purge du tray les retirait aussitôt — les tests échouaient sur un
    /// détail de calendrier, pas sur ce qu'ils vérifient (la propagation des
    /// compteurs, l'insertion d'un nouveau groupe).
    static func iso(_ offset: TimeInterval) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date().addingTimeInterval(offset))
    }

    // MARK: - Group intro (interstitiel inter-groupes)

    func makeIntroGroup(id: String = "intro-user-\(UUID().uuidString)",
                                username: String = "alice") -> StoryGroup {
        StoryGroup(id: id, username: username, avatarColor: "6366F1",
                   stories: [makeStoryItem()])
    }

    static func makeStatusPost(authorId: String, authorName: String,
                                       mood: String, content: String?) -> APIPost {
        let contentJSON = content.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {
            "id": "status-\(authorId)",
            "type": "STATUS",
            "moodEmoji": "\(mood)",
            "content": \(contentJSON),
            "createdAt": "2026-07-03T10:00:00.000Z",
            "author": {"id": "\(authorId)", "username": "\(authorName)"}
        }
        """)
    }

    // MARK: - executeQueuedPublish() Tests (V3 reconstruction)

    static func makeTextOnlySlide(
        id: String = UUID().uuidString,
        content: String = "Hello"
    ) -> StorySlide {
        StorySlide(id: id, content: content, effects: StoryEffects(), duration: 5, order: 0)
    }

    static func makeQueueItem(
        slides: [StorySlide],
        mediaReferences: [StoryMediaReference] = [],
        visibility: String = "PUBLIC"
    ) throws -> StoryPublishQueueItem {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(slides)
        return StoryPublishQueueItem(
            visibility: visibility,
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: mediaReferences
        )
    }

    // MARK: - ReceiverCoverPlan (aperçu à la volée côté récepteur)

    func makeReceiverStory(
        id: String = "recv-1",
        media: [FeedMedia] = [],
        effects: StoryEffects?
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: "story",
            media: media,
            storyEffects: effects,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(72000),
            isViewed: false
        )
    }

    // MARK: - #11868 — le préchargement du tray s'arrête hors du premier plan

    /// Ce que le préchargeur a demandé de télécharger, passe après passe.
    @MainActor
    final class TrayFetchRecorder {
        private(set) var calls: [[String]] = []
        func started(_ urls: [String]) { calls.append(urls) }
    }

    func trayStory(_ id: String, urls: [String]) -> StoryItem {
        StoryItem(
            id: id,
            media: urls.enumerated().map { FeedMedia(id: "\(id)-m\($0.offset)", type: .image, url: $0.element) },
            storyEffects: nil,
            createdAt: Date()
        )
    }

    func eventually(_ condition: @escaping @MainActor () -> Bool) async {
        for _ in 0..<200 where !condition() {
            _ = await cancellableSleep(for: .milliseconds(10))
        }
    }
}
