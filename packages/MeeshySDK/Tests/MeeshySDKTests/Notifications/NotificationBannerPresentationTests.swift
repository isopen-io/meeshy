import XCTest
@testable import MeeshySDK

/// **Une bannière doit dire CE QUI vient d'arriver.**
///
/// Elle n'affichait que l'auteur et le contenu : un commentaire sur un réel,
/// une réaction à une story et la publication d'une humeur donnaient toutes
/// trois « Alice » / « super ! » (signalé par le porteur produit, 2026-08-30).
///
/// Ces témoins tiennent les SEPT cadrages du produit. Ils portent tous sur la
/// composition PURE (`bannerPresentation(groupName:)`) : la phrase d'action
/// vient du serveur (Prisme, i18n serveur) et n'est jamais réécrite ici — ce
/// que ces tests vérifient, c'est qu'elle est bien LUE, POSÉE au bon endroit,
/// et jamais dite deux fois.
final class NotificationBannerPresentationTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func makeEvent(_ json: String) throws -> SocketNotificationEvent {
        try decoder.decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    // MARK: - 1. Commentaire de contenu

    func test_contentComment_headlineSaysWhatWasCommented_bodyIsTheComment() throws {
        let event = try makeEvent("""
        {
            "id": "n1", "userId": "u1", "type": "post_comment",
            "title": "Bob Commentateur",
            "subtitle": "a commenté votre réel",
            "content": "Superbe montage !",
            "actor": { "id": "a1", "displayName": "Bob Commentateur" },
            "metadata": { "postType": "REEL", "postThumbnailUrl": "https://cdn/reel.jpg" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Bob Commentateur a commenté votre réel")
        XCTAssertEqual(banner.body, "Superbe montage !")
        XCTAssertEqual(banner.thumbnailURL, "https://cdn/reel.jpg")
        XCTAssertNil(banner.reactionBadge)
    }

    func test_contentComment_withoutThumbnail_stillCarriesATypedSymbol() throws {
        let event = try makeEvent("""
        {
            "id": "n2", "userId": "u1", "type": "story_new_comment",
            "title": "Eve", "subtitle": "a commenté votre story",
            "content": "trop bien",
            "actor": { "id": "a1", "displayName": "Eve" },
            "metadata": { "postType": "STORY" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Eve a commenté votre story")
        XCTAssertNil(banner.thumbnailURL)
        XCTAssertEqual(banner.contentSymbol, "circle.dashed.inset.filled")
    }

    // MARK: - 2. Publication de nouveau contenu

    func test_newContent_headlineSaysWhatWasPublished_bodyIsTheExcerpt() throws {
        let event = try makeEvent("""
        {
            "id": "n3", "userId": "u1", "type": "friend_new_post",
            "title": "Ivan", "subtitle": "a publié un nouveau réel",
            "content": "Mon week-end en 15 secondes",
            "actor": { "id": "a1", "displayName": "Ivan" },
            "metadata": { "contentType": "REEL", "postThumbnailUrl": "https://cdn/r.jpg", "mediaType": "video" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Ivan a publié un nouveau réel")
        XCTAssertEqual(banner.body, "Mon week-end en 15 secondes")
        XCTAssertEqual(banner.thumbnailURL, "https://cdn/r.jpg")
    }

    /// Le serveur garantit que la LIGNE DE LISTE n'est jamais vide : sans
    /// extrait, `content` retombe sur la phrase d'action elle-même. Sur une
    /// bannière qui la porte déjà en headline, la répéter dirait deux fois la
    /// même chose — c'est le dédoublonnage que le push fait déjà de son côté.
    func test_newContentWithoutText_doesNotRepeatTheActionInTheBody() throws {
        let event = try makeEvent("""
        {
            "id": "n4", "userId": "u1", "type": "friend_new_story",
            "title": "Ivan", "subtitle": "a publié une nouvelle story",
            "content": "a publié une nouvelle story",
            "actor": { "id": "a1", "displayName": "Ivan" },
            "metadata": { "contentType": "STORY", "mediaType": "image" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Ivan a publié une nouvelle story")
        // Par la PROPRIÉTÉ, jamais par « 📷 Photo » : le résumé média est
        // localisé, et un témoin qui compare un libellé à un littéral de langue
        // est vert par accident — celui de la locale de la machine qui l'écrit.
        XCTAssertEqual(banner.body, event.bannerMediaSummary)
        XCTAssertNotEqual(banner.body, event.subtitle,
                          "le corps DIT le média, il ne redit pas l'action")
    }

    // MARK: - 3. Message privé

    func test_directMessage_headlineIsJustTheSender() throws {
        let event = try makeEvent("""
        {
            "id": "n5", "userId": "u1", "type": "new_message",
            "title": "Bob", "content": "Coucou",
            "actor": { "id": "a1", "displayName": "Bob" },
            "context": { "conversationId": "c2", "conversationTitle": "Bob", "conversationType": "direct" }
        }
        """)

        let banner = event.bannerPresentation(groupName: nil)
        XCTAssertEqual(banner.headline, "Bob")
        XCTAssertEqual(banner.body, "Coucou")
    }

    // MARK: - 4. Message de groupe

    func test_groupMessage_headlineNamesTheGroup() throws {
        let event = try makeEvent("""
        {
            "id": "n6", "userId": "u1", "type": "new_message",
            "title": "Alice", "subtitle": "Équipe Tech", "content": "Salut tout le monde",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": { "conversationId": "c1", "conversationTitle": "Équipe Tech", "conversationType": "group" }
        }
        """)

        // Le connecteur (« dans » / « in » / « en ») est LOCALISÉ : l'assertion
        // porte sur le cadrage — l'acteur ET le groupe, tous deux nommés — et
        // non sur une phrase française qui ne serait verte qu'en France.
        let headline = event.bannerPresentation().headline
        XCTAssertTrue(headline.contains("Alice"))
        XCTAssertTrue(headline.contains("Équipe Tech"),
                      "un message de groupe doit NOMMER son groupe")
        XCTAssertNotEqual(headline, "Alice", "sinon le cadrage de groupe n'a pas eu lieu")
    }

    /// Le nom du groupe est celui que l'APPAREIL connaît : renommage local +
    /// emoji favori, que le serveur ne peut pas composer (ils ne sont pas
    /// forcément synchronisés).
    func test_groupMessage_prefersTheLocalGroupName() throws {
        let event = try makeEvent("""
        {
            "id": "n7", "userId": "u1", "type": "new_message",
            "title": "Alice", "subtitle": "Équipe Tech", "content": "Salut",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": { "conversationId": "c1", "conversationTitle": "Équipe Tech", "conversationType": "group" }
        }
        """)

        let headline = event.bannerPresentation(groupName: "😴 Mon équipe à moi").headline
        XCTAssertTrue(headline.contains("😴 Mon équipe à moi"))
        XCTAssertFalse(headline.contains("Équipe Tech"),
                       "le nom SERVEUR ne doit pas survivre au nom local")
    }

    func test_groupMessage_withAttachment_bodyPrefixesTheMediaLabel() throws {
        let event = try makeEvent("""
        {
            "id": "n8", "userId": "u1", "type": "new_message",
            "title": "Alice", "content": "",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": { "conversationTitle": "Photos", "conversationType": "group" },
            "metadata": { "attachments": { "count": 1, "firstType": "image" } }
        }
        """)

        XCTAssertEqual(event.bannerPresentation().body, "\u{1F4F7} Photo")
    }

    /// Un message protégé (éphémère / vue unique / flouté / chiffré) arrive avec
    /// un placeholder pour corps et SANS média : la passerelle retient le
    /// fichier en bloc (cycle 125). La bannière montre l'indicateur, jamais le
    /// contenu — et ne fabrique pas de vignette depuis une autre source.
    func test_protectedMessage_showsTheIndicator_andNeverAThumbnail() throws {
        let event = try makeEvent("""
        {
            "id": "n9", "userId": "u1", "type": "new_message",
            "title": "Alice", "content": "👁️ 🖼️",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": { "conversationTitle": "Photos", "conversationType": "group" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.body, "👁️ 🖼️")
        XCTAssertNil(banner.thumbnailURL)
    }

    func test_message_withImageAttachment_usesItAsThumbnail() throws {
        let event = try makeEvent("""
        {
            "id": "n10", "userId": "u1", "type": "new_message",
            "title": "Alice", "content": "regarde",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": {
                "conversationTitle": "Photos", "conversationType": "group",
                "firstAttachmentUrl": "https://cdn/photo.jpg", "firstAttachmentMimeType": "image/jpeg"
            }
        }
        """)

        XCTAssertEqual(event.bannerPresentation().thumbnailURL, "https://cdn/photo.jpg")
    }

    func test_message_withAudioAttachment_isNotRenderedAsAnImage() throws {
        let event = try makeEvent("""
        {
            "id": "n11", "userId": "u1", "type": "new_message",
            "title": "Alice", "content": "🎵 Audio · 0:34",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": {
                "conversationTitle": "Voice", "conversationType": "group",
                "firstAttachmentUrl": "https://cdn/voice.m4a", "firstAttachmentMimeType": "audio/m4a"
            }
        }
        """)

        XCTAssertNil(event.bannerPresentation().thumbnailURL)
    }

    // MARK: - 5 & 6. Relations

    func test_friendRequest_headlineIsTheAction_andNoBodyRepeatsIt() throws {
        let event = try makeEvent("""
        {
            "id": "n12", "userId": "u1", "type": "friend_request",
            "title": "Alice", "subtitle": "veut se connecter",
            "content": "Nouvelle demande de contact",
            "actor": { "id": "a1", "displayName": "Alice" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Alice veut se connecter")
        XCTAssertNil(banner.body, "« Nouvelle demande de contact » redit la headline, en moins bien")
    }

    func test_friendAccepted_headlineIsTheAction() throws {
        let event = try makeEvent("""
        {
            "id": "n13", "userId": "u1", "type": "friend_accepted",
            "title": "Bob", "subtitle": "a accepté votre demande",
            "content": "Demande de contact acceptée",
            "actor": { "id": "a1", "displayName": "Bob" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Bob a accepté votre demande")
        XCTAssertNil(banner.body)
    }

    // MARK: - 7. Réaction à un contenu

    func test_contentReaction_headlineSaysWhatWasReactedTo_bodyShowsTheTarget() throws {
        let event = try makeEvent("""
        {
            "id": "n14", "userId": "u1", "type": "story_reaction",
            "title": "Sam", "subtitle": "a réagi 🔥 à votre story",
            "content": "Votre story · 📷 Photo",
            "actor": { "id": "a1", "displayName": "Sam" },
            "metadata": { "postType": "STORY", "emoji": "🔥", "postThumbnailUrl": "https://cdn/s.jpg" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Sam a réagi 🔥 à votre story")
        XCTAssertEqual(banner.body, "Votre story · 📷 Photo")
        XCTAssertEqual(banner.thumbnailURL, "https://cdn/s.jpg")
        XCTAssertNil(banner.reactionBadge, "l'émoji est DÉJÀ dans la phrase — le répéter est du bruit")
    }

    /// Une ligne ancienne, ou un éventail dont la phrase ne porte pas l'émoji :
    /// la réaction doit alors être rendue COMME une réaction, pas perdue.
    func test_contentReaction_whenTheActionOmitsTheEmoji_thePastilleCarriesIt() throws {
        let event = try makeEvent("""
        {
            "id": "n15", "userId": "u1", "type": "comment_like",
            "title": "Sam", "subtitle": "a aimé votre commentaire",
            "content": "« Bien vu ! »",
            "actor": { "id": "a1", "displayName": "Sam" },
            "metadata": { "emoji": "👍" }
        }
        """)

        XCTAssertEqual(event.bannerPresentation().reactionBadge, "👍")
    }

    func test_messageReaction_readsTheOtherWireNameOfTheEmoji() throws {
        let event = try makeEvent("""
        {
            "id": "n16", "userId": "u1", "type": "message_reaction",
            "title": "Grace", "subtitle": "Équipe Tech",
            "content": "a réagi à votre message",
            "actor": { "id": "a1", "displayName": "Grace" },
            "context": { "conversationTitle": "Équipe Tech", "conversationType": "group" },
            "metadata": { "reactionEmoji": "🔥" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertTrue(banner.headline.contains("Équipe Tech"), "cadrage de conversation")
        XCTAssertEqual(banner.reactionBadge, "🔥")
    }

    // MARK: - Replis

    func test_withoutServerAction_headlineStaysTheActorAlone() throws {
        let event = try makeEvent("""
        {
            "id": "n17", "userId": "u1", "type": "post_repost",
            "title": "Heidi", "content": "a partagé votre publication",
            "actor": { "id": "a1", "displayName": "Heidi" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Heidi")
        XCTAssertEqual(banner.body, "a partagé votre publication")
    }

    func test_withoutActor_fallsBackToTheGatewayHeader() throws {
        let event = try makeEvent("""
        {
            "id": "n18", "userId": "u1", "type": "system",
            "title": "Meeshy", "subtitle": "a publié une annonce",
            "content": "Maintenance prévue à 22h"
        }
        """)

        XCTAssertEqual(event.bannerPresentation().headline, "Meeshy a publié une annonce")
    }

    func test_blankFieldsAreTreatedAsAbsent() throws {
        let event = try makeEvent("""
        {
            "id": "n19", "userId": "u1", "type": "post_comment",
            "title": "Dana", "subtitle": "   ", "content": "  ",
            "actor": { "id": "a1", "displayName": "Dana" }
        }
        """)

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Dana")
        XCTAssertNil(banner.body)
    }

    // MARK: - Le cadrage est décidé par le TYPE

    func test_framingIsDecidedByType_notByTheShapeOfTheFields() throws {
        let mention = try makeEvent("""
        { "id": "a", "userId": "u", "type": "user_mentioned", "content": "x" }
        """)
        let request = try makeEvent("""
        { "id": "b", "userId": "u", "type": "contact_request", "content": "x" }
        """)
        let mood = try makeEvent("""
        { "id": "c", "userId": "u", "type": "friend_new_mood", "content": "x" }
        """)

        XCTAssertEqual(mention.bannerFraming, .conversation)
        XCTAssertEqual(request.bannerFraming, .relation)
        XCTAssertEqual(mood.bannerFraming, .action)
    }
}
