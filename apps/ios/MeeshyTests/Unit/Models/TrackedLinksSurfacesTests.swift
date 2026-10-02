import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy
@testable import MeeshySDK

/// #9075 — **toute adresse affichée dans une story, un post ou un commentaire
/// s'ouvre par le lien suivi `/l/<token>` de la carte servie.**
///
/// La passerelle range `{ url, token }` dans `metadata.trackingLinks` (REST) ou
/// le hisse en `trackingLinks` (socket), sur les posts, les stories ET les
/// commentaires. Une surface qui ne reçoit pas la carte rend l'adresse BRUTE :
/// le clic part vers le site sans passer par la passerelle, et ne se compte pas.
///
/// Chaque témoin décode ou compose une VALEUR et observe ce qu'elle porte — la
/// carte arrivée jusqu'au modèle que la vue lit, ou la destination que le texte
/// rendu attache au lien. Aucun ne lit un fichier source.
final class TrackedLinksSurfacesTests: XCTestCase {

    // MARK: - Fixtures

    private static let notes = "https://meeshy.me/notes"
    private static let carte = [notes: "tok42"]
    private static let staging = "https://staging.meeshy.me"

    private static let carteJSON = "[{\"url\":\"\(notes)\",\"token\":\"tok42\"}]"

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try APIClient.makeAPIPayloadDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func commentaireJSON(extra: String) -> String {
        """
        {"id":"c-2","content":"Lien : \(Self.notes)","createdAt":"2026-10-02T10:00:00.000Z",
         "author":{"id":"u-1","username":"ada","displayName":"Ada"}\(extra)}
        """
    }

    private func liens(_ texte: AttributedString) -> [URL] {
        texte.runs.compactMap(\.link)
    }

    // MARK: - L'hôte du lien suivi est celui de l'environnement actif

    func test_redirectURL_surStaging_pointeVersLHoteWebDeStaging() {
        XCTAssertEqual(TrackedLink.redirectURL(token: "tok42", webOrigin: Self.staging)?.absoluteString,
                       "https://staging.meeshy.me/l/tok42")
    }

    func test_redirectURL_parDefaut_suitLOrigineWebDeLaConfiguration() {
        XCTAssertEqual(TrackedLink.redirectURL(token: "tok42")?.absoluteString,
                       "\(MeeshyConfig.shared.webOrigin)/l/tok42")
    }

    @MainActor
    func test_rendu_adresseMappee_ouvreLeLienSuiviDeLOrigineInjectee() {
        let texte = MessageTextRenderer.attributed("Lien : \(Self.notes)", color: .white,
                                                   trackedLinks: Self.carte, webOrigin: Self.staging)

        XCTAssertEqual(liens(texte).map(\.absoluteString), ["https://staging.meeshy.me/l/tok42"])
    }

    @MainActor
    func test_rendu_adresseNonMappee_garderLAdresseBrute() {
        let texte = MessageTextRenderer.attributed("Lien : https://example.com/x", color: .white,
                                                   trackedLinks: Self.carte, webOrigin: Self.staging)

        XCTAssertEqual(liens(texte).map(\.absoluteString), ["https://example.com/x"])
    }

    // MARK: - La légende partagée (story, galerie, scène, réel)

    @MainActor
    func test_legendeRiche_porteLeLienSuiviDeSaCarte() {
        let legende = MediaCaptionRichText("Lien : \(Self.notes)", size: 14,
                                           trackedLinks: Self.carte, webOrigin: Self.staging)

        XCTAssertEqual(liens(legende.attributed).map(\.absoluteString), ["https://staging.meeshy.me/l/tok42"])
    }

    // MARK: - Commentaires : la carte arrive jusqu'à la ligne

    func test_commentaire_REST_carteDuMetadata_atteintLaLigne() throws {
        let api = try decode(APIPostComment.self,
                             commentaireJSON(extra: ",\"metadata\":{\"trackingLinks\":\(Self.carteJSON)}"))

        XCTAssertEqual(FeedComment(api: api, preferredLanguages: []).trackedLinkMap, Self.carte)
    }

    func test_commentaire_socket_carteHissee_atteintLaLigne() throws {
        let api = try decode(APIPostComment.self,
                             commentaireJSON(extra: ",\"trackingLinks\":\(Self.carteJSON)"))

        XCTAssertEqual(FeedComment(api: api, preferredLanguages: []).trackedLinkMap, Self.carte)
    }

    func test_commentaire_metadataIllisible_neFaitPasTomberLeCommentaire() throws {
        let api = try decode(APIPostComment.self,
                             commentaireJSON(extra: ",\"metadata\":{\"trackingLinks\":\"oops\"}"))

        XCTAssertEqual(api.id, "c-2")
        XCTAssertTrue(api.trackedLinkMap.isEmpty)
    }

    @MainActor
    func test_commentaireDeStory_porteSaCarte() throws {
        let api = try decode(APIPostComment.self,
                             commentaireJSON(extra: ",\"metadata\":{\"trackingLinks\":\(Self.carteJSON)}"))

        XCTAssertEqual(StoryViewerView.storyComment(from: api, preferredLanguages: []).trackedLinkMap, Self.carte)
    }

    func test_commentaire_survitAuCache() throws {
        let ligne = FeedComment(id: "c-2", author: "Ada", authorId: "u-1",
                                content: "Lien : \(Self.notes)", trackedLinkMap: Self.carte)
        let relu = try JSONDecoder().decode(FeedComment.self, from: JSONEncoder().encode(ligne))

        XCTAssertEqual(relu.trackedLinkMap, Self.carte)
    }

    func test_commentaireEmbarqueDansUnPost_porteSaCarte() throws {
        let post = try decode(APIPost.self, """
        {"id":"p-1","type":"POST","content":"x","createdAt":"2026-10-02T10:00:00.000Z",
         "author":{"id":"u-9","username":"zoe"},
         "comments":[\(commentaireJSON(extra: ",\"metadata\":{\"trackingLinks\":\(Self.carteJSON)}"))]}
        """)

        XCTAssertEqual(post.toFeedPost().comments.first?.trackedLinkMap, Self.carte)
    }

    // MARK: - Stories : la carte du post atteint la story que le lecteur rend

    func test_story_REST_carteDuMetadata_atteintLaStory() throws {
        let post = try decode(APIPost.self, """
        {"id":"6abf62d53353b9f45614a07a","type":"STORY","content":"Lien : \(Self.notes)",
         "createdAt":"2026-10-02T10:00:00.000Z","author":{"id":"u-9","username":"zoe"},
         "metadata":{"trackingLinks":\(Self.carteJSON)}}
        """)

        XCTAssertEqual([post].toStoryGroups().first?.stories.first?.trackedLinkMap, Self.carte)
    }

    func test_story_depuisUnFeedPost_porteSaCarte() {
        var post = FeedPost(id: "p-1", author: "Zoe", content: "Lien : \(Self.notes)")
        post.trackedLinkMap = Self.carte

        XCTAssertEqual(StoryItem(feedPost: post).trackedLinkMap, Self.carte)
    }

    func test_story_traductionArrivee_garderSaCarte() {
        let story = StoryItem(id: "s-1", content: "Lien : \(Self.notes)",
                              trackingLinks: [TrackedLink(url: Self.notes, token: "tok42")])

        XCTAssertEqual(story.mergingContentTranslation(language: "en", content: "Link: \(Self.notes)").trackedLinkMap,
                       Self.carte)
        XCTAssertEqual(story.mergingTextObjectTranslations(at: 0, translations: ["en": "x"]).trackedLinkMap,
                       Self.carte)
    }

    func test_story_survitAuCache() throws {
        let story = StoryItem(id: "s-1", content: "Lien : \(Self.notes)",
                              trackingLinks: [TrackedLink(url: Self.notes, token: "tok42")])
        let relue = try JSONDecoder().decode(StoryItem.self, from: JSONEncoder().encode(story))

        XCTAssertEqual(relue.trackedLinkMap, Self.carte)
    }

    // MARK: - Posts : la carte survit au cache du fil (réels compris)

    func test_post_survitAuCache() throws {
        var post = FeedPost(id: "p-1", author: "Zoe", content: "Lien : \(Self.notes)")
        post.trackedLinkMap = Self.carte
        let relu = try JSONDecoder().decode(FeedPost.self, from: JSONEncoder().encode(post))

        XCTAssertEqual(relu.trackedLinkMap, Self.carte)
    }

    // MARK: - Galerie d'un post : chaque page porte la carte de SON porteur

    private func media(_ id: String, caption: String) -> FeedMedia {
        FeedMedia(id: id, type: .image, url: "https://cdn.meeshy.me/\(id)",
                  width: 1_080, height: 1_350, caption: caption)
    }

    func test_galerie_legendeDUnMediaDuPost_porteLaCarteDuPost() {
        var post = FeedPost(id: "p-1", author: "Zoe", content: "")
        post.media = [media("m1", caption: "a"), media("m2", caption: "Lien : \(Self.notes)")]
        post.trackedLinkMap = Self.carte

        let lot = PostGalleryLot.compose(post: post, comments: [], preferredLanguages: [])

        XCTAssertEqual(lot.captionLinks["m2"], Self.carte)
    }

    /// Au RANG 2 : le média du DEUXIÈME commentaire porte la carte de CE
    /// commentaire — jamais celle du post, ni celle du premier commentaire.
    func test_galerie_legendeDUnMediaDeCommentaire_porteLaCarteDuCommentaire() {
        var post = FeedPost(id: "p-1", author: "Zoe", content: "")
        post.trackedLinkMap = ["https://meeshy.me/autre": "tokPost"]
        let premier = FeedComment(id: "c-1", author: "Bob", content: "x",
                                  media: [media("cm1", caption: "b")],
                                  trackedLinkMap: ["https://meeshy.me/b": "tokB"])
        let second = FeedComment(id: "c-2", author: "Ada", content: "y",
                                 media: [media("cm2", caption: "Lien : \(Self.notes)")],
                                 trackedLinkMap: Self.carte)

        let lot = PostGalleryLot.compose(post: post, comments: [premier, second], preferredLanguages: [])

        XCTAssertEqual(lot.captionLinks["cm2"], Self.carte)
    }
}
