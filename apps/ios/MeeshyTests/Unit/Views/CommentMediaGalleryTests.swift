import XCTest
@testable import Meeshy
import MeeshySDK

/// Le plein écran d'un média de commentaire feuillette les médias de TOUS les
/// commentaires de l'objet porteur (post, story, réel), légendes comprises.
///
/// Comportement testé par l'API publique de la dérivation — aucune vue montée :
/// c'est ce qui rend la règle vérifiable là où le simulateur ne l'est pas.
@MainActor
final class CommentMediaGalleryTests: XCTestCase {

    // MARK: - Fabriques

    private func media(
        _ id: String, _ type: FeedMediaType = .image, caption: String? = nil
    ) -> FeedMedia {
        FeedMedia(id: id, type: type, url: "https://cdn.test/\(id)", caption: caption)
    }

    private func comment(
        _ id: String, text: String = "", translated: String? = nil, media: [FeedMedia] = [],
        parentId: String? = nil, author: String = "alice"
    ) -> FeedComment {
        FeedComment(
            id: id, author: author, authorId: author, content: text,
            parentId: parentId, translatedContent: translated, media: media
        )
    }

    // MARK: - Ce que la galerie contient

    func test_snapshot_gathersVisualMediaOfEveryComment_inOrder() {
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", media: [media("m1")]),
            comment("c2", media: [media("m2", .video)]),
            comment("c3", media: [media("m3")]),
        ])

        XCTAssertEqual(snapshot.attachments.map(\.id), ["m1", "m2", "m3"])
    }

    func test_snapshot_excludesAudioAndDocument_theyHaveTheirOwnFullscreen() {
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", media: [media("son", .audio)]),
            comment("c2", media: [media("doc", .document)]),
            comment("c3", media: [media("photo")]),
        ])

        XCTAssertEqual(snapshot.attachments.map(\.id), ["photo"])
    }

    func test_snapshot_dropsDuplicates_soEveryPageKeepsAUniqueIndex() {
        let repeated = media("m1")
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", media: [repeated]),
            comment("c1-again", media: [repeated]),
        ])

        XCTAssertEqual(snapshot.attachments.map(\.id), ["m1"])
    }

    func test_snapshot_emptyComments_yieldsEmptyGallery() {
        let snapshot = CommentMediaGallery.snapshot(from: [])

        XCTAssertTrue(snapshot.attachments.isEmpty)
        XCTAssertFalse(snapshot.contains("m1"))
    }

    func test_contains_answersForTheTappedMedia() {
        let snapshot = CommentMediaGallery.snapshot(from: [comment("c1", media: [media("m1")])])

        XCTAssertTrue(snapshot.contains("m1"))
        XCTAssertFalse(snapshot.contains("m2"))
    }

    // MARK: - Qui porte l'auteur

    func test_snapshot_attributesEachMediaToItsOwnCommentAuthor() {
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", media: [media("m1")], author: "alice"),
            comment("c2", media: [media("m2")], author: "bob"),
        ])

        XCTAssertEqual(snapshot.senders["m1"]?.senderName, "alice")
        XCTAssertEqual(snapshot.senders["m2"]?.senderName, "bob")
    }

    // MARK: - Légendes

    func test_caption_prefersTheMediaOwnCaption() {
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", text: "texte du commentaire", media: [media("m1", caption: "sa légende")])
        ])

        XCTAssertEqual(snapshot.captions["m1"], "sa légende")
    }

    func test_caption_fallsBackToTheCommentText() {
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", text: "texte du commentaire", media: [media("m1")])
        ])

        XCTAssertEqual(snapshot.captions["m1"], "texte du commentaire")
    }

    /// Le Prisme d'abord : la légende de repli est le texte SERVI au lecteur,
    /// pas l'original de l'auteur.
    func test_caption_fallbackUsesTheTranslatedText() {
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", text: "Hello", translated: "Bonjour", media: [media("m1")])
        ])

        XCTAssertEqual(snapshot.captions["m1"], "Bonjour")
    }

    func test_caption_absentWhenNeitherMediaNorCommentCarriesText() {
        let snapshot = CommentMediaGallery.snapshot(from: [
            comment("c1", text: "   \n ", media: [media("m1")])
        ])

        XCTAssertNil(snapshot.captions["m1"])
    }

    // MARK: - Aplatissement racines + réponses

    func test_flatten_placesEachReplyRightAfterItsParent() {
        let flat = CommentMediaGallery.flatten(
            topLevel: [comment("p1"), comment("p2")],
            replies: [
                "p1": [comment("r1a", parentId: "p1"), comment("r1b", parentId: "p1")],
                "p2": [comment("r2a", parentId: "p2")],
            ]
        )

        XCTAssertEqual(flat.map(\.id), ["p1", "r1a", "r1b", "p2", "r2a"])
    }

    func test_flatten_withoutReplies_keepsTopLevelOrder() {
        let flat = CommentMediaGallery.flatten(
            topLevel: [comment("p1"), comment("p2")], replies: [:]
        )

        XCTAssertEqual(flat.map(\.id), ["p1", "p2"])
    }

    func test_snapshot_pagesThroughRepliesMediaToo() {
        let flat = CommentMediaGallery.flatten(
            topLevel: [comment("p1", media: [media("m1")])],
            replies: ["p1": [comment("r1", media: [media("m2")], parentId: "p1")]]
        )
        let snapshot = CommentMediaGallery.snapshot(from: flat)

        XCTAssertEqual(snapshot.attachments.map(\.id), ["m1", "m2"])
    }

    // MARK: - Signature : ce qui doit redéclencher un rafraîchissement

    func test_signature_stableWhenNothingDisplayedChanges() {
        let comments = [comment("c1", text: "salut", media: [media("m1")])]

        XCTAssertEqual(
            CommentMediaGallery.signature(topLevel: comments, replies: [:]),
            CommentMediaGallery.signature(topLevel: comments, replies: [:])
        )
    }

    func test_signature_movesWhenAMediaCaptionChanges() {
        let before = [comment("c1", media: [media("m1", caption: "avant")])]
        let after = [comment("c1", media: [media("m1", caption: "après")])]

        XCTAssertNotEqual(
            CommentMediaGallery.signature(topLevel: before, replies: [:]),
            CommentMediaGallery.signature(topLevel: after, replies: [:])
        )
    }

    func test_signature_movesWhenAMediaArrivesLate() {
        let before = [comment("c1", text: "salut")]
        let after = [comment("c1", text: "salut", media: [media("m1")])]

        XCTAssertNotEqual(
            CommentMediaGallery.signature(topLevel: before, replies: [:]),
            CommentMediaGallery.signature(topLevel: after, replies: [:])
        )
    }

    func test_signature_movesWhenARepliesThreadIsExpanded() {
        let top = [comment("p1")]

        XCTAssertNotEqual(
            CommentMediaGallery.signature(topLevel: top, replies: [:]),
            CommentMediaGallery.signature(
                topLevel: top, replies: ["p1": [comment("r1", media: [media("m1")], parentId: "p1")]]
            )
        )
    }

    /// Un like sur un AUTRE commentaire ne doit pas invalider la galerie —
    /// c'est ce qui garde le défilement de la liste à coût nul.
    func test_signature_ignoresWhatTheGalleryDoesNotShow() {
        var liked = comment("c1", text: "salut", media: [media("m1")])
        liked.likes += 12

        XCTAssertEqual(
            CommentMediaGallery.signature(topLevel: [comment("c1", text: "salut", media: [media("m1")])], replies: [:]),
            CommentMediaGallery.signature(topLevel: [liked], replies: [:])
        )
    }

    // MARK: - La boîte de contexte

    func test_context_servesTheCommentsItWasLastGiven() {
        let context = CommentMediaGalleryContext()
        context.update(topLevel: [comment("c1", media: [media("m1")])], replies: [:])

        XCTAssertEqual(context.snapshot().attachments.map(\.id), ["m1"])
    }

    func test_context_refreshesWhenTheCommentsChange() {
        let context = CommentMediaGalleryContext()
        context.update(topLevel: [comment("c1", media: [media("m1")])], replies: [:])
        _ = context.snapshot()
        context.update(
            topLevel: [comment("c1", media: [media("m1")]), comment("c2", media: [media("m2")])],
            replies: [:]
        )

        XCTAssertEqual(context.snapshot().attachments.map(\.id), ["m1", "m2"])
    }

    func test_context_repeatedReadsAreStable() {
        let context = CommentMediaGalleryContext()
        context.update(topLevel: [comment("c1", media: [media("m1")])], replies: [:])

        XCTAssertEqual(context.snapshot().attachments.map(\.id), context.snapshot().attachments.map(\.id))
    }

    /// Une surface non câblée ne doit jamais feuilleter la galerie d'un autre
    /// objet : sa boîte est vide, et `CommentMediaView` retombe alors sur le
    /// média tapé seul.
    func test_context_startsEmpty_soAnUnwiredHostFallsBackToTheTappedMedia() {
        XCTAssertTrue(CommentMediaGalleryContext().snapshot().attachments.isEmpty)
    }

    // MARK: - La règle de légende, partagée avec les posts

    func test_postCaption_usesEachMediaOwnCaption() {
        let map = SocialMediaCaption.map(
            for: [media("m1", caption: "une"), media("m2", caption: "deux")],
            carrierText: "texte du post"
        )

        XCTAssertEqual(map["m1"], "une")
        XCTAssertEqual(map["m2"], "deux")
    }

    /// Un post à plusieurs visuels : son texte décrit le LOT, pas une pièce —
    /// le coller sous chacune ferait mentir la légende.
    func test_postCaption_doesNotSpreadThePostTextOverSeveralMedia() {
        let map = SocialMediaCaption.map(
            for: [media("m1"), media("m2")], carrierText: "texte du post"
        )

        XCTAssertTrue(map.isEmpty)
    }

    func test_postCaption_usesThePostTextWhenASingleVisualCarriesIt() {
        let map = SocialMediaCaption.map(for: [media("m1")], carrierText: "texte du post")

        XCTAssertEqual(map["m1"], "texte du post")
    }

    func test_postCaption_ignoresNonVisualMediaWhenCountingTheSingleVisual() {
        let map = SocialMediaCaption.map(
            for: [media("m1"), media("son", .audio)], carrierText: "texte du post"
        )

        XCTAssertEqual(map["m1"], "texte du post")
        XCTAssertNil(map["son"])
    }

    func test_postCaption_trimsAndDropsBlankText() {
        XCTAssertNil(SocialMediaCaption.resolve(own: "   ", carrierText: "\n\t "))
        XCTAssertEqual(SocialMediaCaption.resolve(own: nil, carrierText: "  ok  "), "ok")
    }
}

/// Gardes de CÂBLAGE : la dérivation ci-dessus peut être juste et n'atteindre
/// aucun écran. Ce que ces gardes vérifient est ce qui a réellement manqué —
/// un `captionMap` jamais passé, une galerie montée sur un tableau d'UN élément.
final class CommentMediaGalleryWiringGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: path)
    }

    func test_everyCommentHost_declaresTheSharedGallery() throws {
        for path in [
            "Meeshy/Features/Main/Views/FeedCommentsSheet.swift",
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/StoryViewerView+Content.swift",
        ] {
            let text = try source(path)
            XCTAssertTrue(
                text.contains(".commentMediaGallery("),
                "\(path) : sans cette déclaration, le plein écran d'un commentaire retombe sur une page unique."
            )
            XCTAssertTrue(
                text.contains("carrierText: comment.displayContent"),
                "\(path) : le texte du commentaire est la légende de repli de son média."
            )
        }
    }

    func test_commentFullscreen_isNeverBuiltFromASingleElementArray() throws {
        let text = try source("Meeshy/Features/Main/Views/CommentMediaView.swift")

        XCTAssertFalse(
            text.contains("allAttachments: [attachment]"),
            "Le plein écran d'un commentaire doit feuilleter la galerie de l'objet, pas une page unique."
        )
        XCTAssertTrue(text.contains("gallery?.snapshot()"))
        XCTAssertTrue(text.contains("captionMap: snapshot.captions"))
    }

    func test_everySocialFullscreen_passesACaptionMap() throws {
        for path in [
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/PostDetailView.swift",
            "Meeshy/Features/Main/Views/CommentMediaView.swift",
        ] {
            let text = try source(path)
            XCTAssertTrue(
                text.contains("captionMap:"),
                "\(path) : une galerie montée sans `captionMap` ne peut afficher AUCUNE légende."
            )
        }
    }

    /// La légende voyageait déjà sur le fil (`APIPostMedia.caption`) et dans le
    /// schéma — c'est le modèle iOS qui la jetait.
    func test_feedMedia_carriesItsCaptionToTheAttachmentBridge() throws {
        let url = MyStoriesSourceCorpus.appRoot()
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift")
        let text = MyStoriesSourceCorpus.strippingComments(
            try String(contentsOf: url, encoding: .utf8)
        )

        XCTAssertTrue(text.contains("public var caption: String?"))
        XCTAssertTrue(text.contains("caption = try c.decodeIfPresent(String.self, forKey: .caption)"))
        XCTAssertTrue(text.contains("caption: caption,"))
    }
}
