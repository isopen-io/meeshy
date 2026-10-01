import Foundation
import Testing
@testable import MeeshySDK

/// #8897 — directive porteur 2026-09-30 : « l'icône message se répète dans la
/// notification in-app alors qu'on sait déjà cela via l'icône sur l'avatar ».
///
/// La pastille de l'avatar dit le TYPE. La case devant le corps n'existe que
/// pour une VRAIE vignette (photo, vignette vidéo, image d'aperçu de lien,
/// miniature de contenu) ou pour un CONTENU SOCIAL visé (story, réel, humeur,
/// statut, publication) — la règle du web (`ContentTile`, `notification-toast.tsx`).
/// Jamais de case-symbole pour un message de conversation : le corps servi
/// porte déjà son emoji unique (« 🎵 Audio · 0:32 », « 📍 Tour Eiffel »).
@Suite("Bannière in-app : le type est dit une seule fois (#8897)")
struct NotificationBannerNoRepeatTests {

    private func event(_ json: String) throws -> SocketNotificationEvent {
        try JSONDecoder().decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    @Test("un message texte n'a aucune case : la pastille dit déjà « message »")
    func textMessage_hasNoTile() throws {
        let banner = try event("""
        { "id": "m1", "userId": "u", "type": "new_message", "title": "Bob", "content": "Coucou",
          "actor": { "id": "a", "displayName": "Bob" }, "context": { "conversationType": "direct" } }
        """).bannerPresentation()
        #expect(banner.contentSymbol == nil)
        #expect(banner.thumbnailURL == nil)
        #expect(banner.showsContentTile == false)
        #expect(banner.body == "Coucou")
    }

    @Test("un vocal sans texte : le corps servi le dit une fois, aucune case « waveform »")
    func voiceMessage_saysTheMediaOnceInTheBody() throws {
        let banner = try event("""
        { "id": "m2", "userId": "u", "type": "new_message", "title": "Awa",
          "content": "🎵 Audio · 0:32 · 193 Ko", "actor": { "id": "a", "displayName": "Awa" },
          "context": { "conversationType": "direct", "firstAttachmentMimeType": "audio/m4a" },
          "metadata": { "commentPreview": "🎵 Audio · 0:32 · 193 Ko", "attachments": { "count": 1, "firstType": "audio" } } }
        """).bannerPresentation()
        #expect(banner.showsContentTile == false)
        #expect(banner.body == "🎵 Audio · 0:32 · 193 Ko")
    }

    @Test("une position : « 📍 » dans le corps, jamais une case épingle en plus")
    func location_saysItOnceInTheBody() throws {
        let banner = try event("""
        { "id": "m3", "userId": "u", "type": "new_message", "title": "Awa", "content": "",
          "actor": { "id": "a", "displayName": "Awa" },
          "context": { "conversationType": "direct", "locationLat": "48.8584", "locationLon": "2.2945",
                       "locationName": "Tour Eiffel" } }
        """).bannerPresentation()
        #expect(banner.showsContentTile == false)
        #expect(banner.body == "📍 Tour Eiffel")
    }

    @Test("un lien sans image d'aperçu : aucune case ; avec image : la vignette seule")
    func link_tileOnlyForARealPreviewImage() throws {
        let bare = try event("""
        { "id": "m4", "userId": "u", "type": "new_message", "title": "Awa", "content": "https://lemonde.fr/a",
          "actor": { "id": "a", "displayName": "Awa" },
          "context": { "conversationType": "direct", "linkUrl": "https://lemonde.fr/a", "linkDomain": "lemonde.fr" } }
        """).bannerPresentation()
        #expect(bare.showsContentTile == false)
        #expect(bare.body == "🔗 lemonde.fr")

        let illustrated = try event("""
        { "id": "m5", "userId": "u", "type": "new_message", "title": "Awa", "content": "https://lemonde.fr/a",
          "actor": { "id": "a", "displayName": "Awa" },
          "context": { "conversationType": "direct", "linkUrl": "https://lemonde.fr/a", "linkDomain": "lemonde.fr",
                       "linkImageUrl": "https://cdn/og.jpg" } }
        """).bannerPresentation()
        #expect(illustrated.showsContentTile)
        #expect(illustrated.thumbnailURL == "https://cdn/og.jpg")
        #expect(illustrated.contentSymbol == nil)
    }

    @Test("une photo garde sa vraie vignette")
    func photoMessage_keepsItsThumbnail() throws {
        let banner = try event("""
        { "id": "m6", "userId": "u", "type": "new_message", "title": "Awa", "content": "regarde",
          "actor": { "id": "a", "displayName": "Awa" },
          "context": { "conversationType": "direct", "firstAttachmentUrl": "https://cdn/p.jpg",
                       "firstAttachmentMimeType": "image/jpeg" },
          "metadata": { "attachments": { "count": 1, "firstType": "image" } } }
        """).bannerPresentation()
        #expect(banner.showsContentTile)
        #expect(banner.thumbnailURL == "https://cdn/p.jpg")
        #expect(banner.contentSymbol == nil)
    }

    @Test("une réaction à un message : pas de case-symbole, l'émoji reste rendu")
    func messageReaction_keepsTheEmojiWithoutATile() throws {
        let banner = try event("""
        { "id": "m7", "userId": "u", "type": "message_reaction", "title": "Grace",
          "content": "a réagi à votre message", "actor": { "id": "a", "displayName": "Grace" },
          "context": { "conversationType": "direct" }, "metadata": { "reactionEmoji": "🔥" } }
        """).bannerPresentation()
        #expect(banner.contentSymbol == nil)
        #expect(banner.showsContentTile == false)
        #expect(banner.reactionBadge == "🔥")
    }

    @Test("un contenu social sans miniature garde sa case typée", arguments: [
        ("STORY", "circle.dashed.inset.filled"),
        ("REEL", "play.rectangle.fill"),
        ("MOOD", "face.smiling.fill"),
        ("STATUS", "face.smiling.fill"),
        ("POST", "square.text.square.fill"),
    ])
    func socialContent_keepsItsTypedTile(postType: String, symbol: String) throws {
        let banner = try event("""
        { "id": "s", "userId": "u", "type": "post_comment", "title": "Eve", "subtitle": "a commenté",
          "content": "trop bien", "actor": { "id": "a", "displayName": "Eve" },
          "metadata": { "postType": "\(postType)" } }
        """).bannerPresentation()
        #expect(banner.contentSymbol == symbol)
        #expect(banner.showsContentTile)
    }

    @Test("une action sans contenu social ni vignette ne retombe plus sur l'icône du type")
    func actionWithoutSocialContent_hasNoTile() throws {
        let banner = try event("""
        { "id": "x", "userId": "u", "type": "comment_like", "title": "Sam", "subtitle": "a aimé votre commentaire",
          "content": "« Bien vu ! »", "actor": { "id": "a", "displayName": "Sam" } }
        """).bannerPresentation()
        #expect(banner.contentSymbol == nil)
        #expect(banner.showsContentTile == false)
    }
}
