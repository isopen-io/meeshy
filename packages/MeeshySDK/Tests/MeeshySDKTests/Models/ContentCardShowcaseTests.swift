import Foundation
import Testing
@testable import MeeshySDK

/// **Une vignette de contenu montre ce que la carte de ce contenu montrerait** (#20243) : la grille « Lui envoyer un
/// contenu » ne tient que des `FeedPost` (cache du profil), et la règle du bloc visuel de #20211 ne s'écrit qu'une
/// fois. Chaque cas se lit donc en PARITÉ : le `FeedPost` projeté d'un `APIPost` élit le même visuel que la carte
/// construite depuis cet `APIPost`.
struct ContentCardShowcaseTests {

    private static let author = #"{"id":"6ada27bf28983c39d9838be9","username":"amani","displayName":"Amani Diallo"}"#

    private func post(_ fields: String) throws -> APIPost {
        let json = #"{"id":"66f0c0ffee0000000000c0de","createdAt":"2026-11-04T09:55:10.287Z","author":\#(Self.author),\#(fields)}"#
        return try MeeshyCoders.decoder(.api).decode(APIPost.self, from: Data(json.utf8))
    }

    private func expectParity(_ fields: String) throws -> ContentCard.Showcase {
        let api = try post(fields)
        let showcase = ContentCard.Showcase(post: api.toFeedPost())
        let card = ContentCard(post: api, preferredLanguages: [])
        #expect(showcase.visual == card.visual)
        #expect(showcase.scene == card.scene)
        return showcase
    }

    private static func object(_ id: String, kind: String, plane: String = "content", payload: String) -> String {
        #"{"id":"\#(id)","kind":"\#(kind)","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"\#(plane)","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":\#(payload)}"#
    }

    private static func scene(_ id: String, _ objects: [String]) -> String {
        #"{"id":"\#(id)","objects":[\#(objects.joined(separator: ","))]}"#
    }

    private static func effects(_ scenes: [String]) -> String {
        #""storyEffects":{"v":3,"scenes":[\#(scenes.joined(separator: ","))]}"#
    }

    private static let backgroundImage = object("bg", kind: "media", payload: #"{"postMediaId":"m-img","mediaType":"image","isBackground":true}"#)
    private static let backgroundVideo = object("bg", kind: "media", payload: #"{"postMediaId":"m-vid","mediaType":"video","isBackground":true}"#)
    private static let colorCarrier = object("bg", kind: "media", plane: "bg", payload: ##"{"backgroundColor":"#1E1B4B"}"##)
    private static let title = object("t1", kind: "text", plane: "fg", payload: #"{"text":"Bonjour"}"#)
    private static let voice = object("a1", kind: "audio", plane: "fg", payload: #"{"postMediaId":"m-aud"}"#)

    private static let image = #"{"id":"m-img","mimeType":"image/jpeg","fileUrl":"/f/i.jpg","thumbnailUrl":"/t/i.jpg","width":1200,"height":900}"#
    private static let bareImage = #"{"id":"m-img2","mimeType":"image/jpeg","fileUrl":"/f/i2.jpg"}"#
    private static let video = #"{"id":"m-vid","mimeType":"video/mp4","fileUrl":"/f/v.mp4","thumbnailUrl":"/t/v.jpg","duration":12000}"#
    private static let audio = #"{"id":"m-aud","mimeType":"audio/mpeg","fileUrl":"/f/a.mp3","duration":31000}"#

    @Test func showcase_severalImagesAndAVideo_isTheSameSlideshowAsTheCard() throws {
        let showcase = try expectParity(#""type":"POST","media":[\#(Self.image),\#(Self.audio),\#(Self.video),\#(Self.bareImage)]"#)
        guard case .slideshow(let pages) = showcase.visual else {
            Issue.record("attendu un diaporama, reçu \(showcase.visual)")
            return
        }
        #expect(pages.count == 3)
    }

    @Test func showcase_singleVideo_isTheVideoWithItsPosterAndDuration() throws {
        let showcase = try expectParity(#""type":"POST","media":[\#(Self.video)]"#)
        guard case .media(let media) = showcase.visual else {
            Issue.record("attendu la vidéo, reçu \(showcase.visual)")
            return
        }
        #expect(media.kind == .video)
        #expect(media.imageURL == "/t/v.jpg")
        #expect(media.durationSeconds == 12)
    }

    @Test func showcase_reelClip_isPortrait() throws {
        let showcase = try expectParity(#""type":"REEL","media":[\#(Self.video)]"#)
        guard case .media(let media) = showcase.visual else {
            Issue.record("attendu la vidéo, reçu \(showcase.visual)")
            return
        }
        #expect(media.aspectRatio == ContentCard.portraitAspectRatio)
    }

    @Test func showcase_singleImageWithoutThumbnail_showsTheFileItself() throws {
        let showcase = try expectParity(#""type":"POST","media":[\#(Self.bareImage)]"#)
        guard case .media(let media) = showcase.visual else {
            Issue.record("attendu l'image, reçu \(showcase.visual)")
            return
        }
        #expect(media.imageURL == "/f/i2.jpg")
    }

    @Test func showcase_voiceNote_isTheSound() throws {
        let showcase = try expectParity(#""type":"POST","content":"Écoutez","media":[\#(Self.audio)]"#)
        #expect(showcase.visual == .sound(ContentCard.Sound(attachmentId: "m-aud", url: "/f/a.mp3", durationSeconds: 31)))
    }

    @Test func showcase_moodWithOnlyABackgroundSound_isTheSound() throws {
        let api = try post(#""type":"STATUS","moodEmoji":"🎧","audioUrl":"/f/fond.m4a""#)
        let showcase = ContentCard.Showcase(post: api.toFeedPost())
        #expect(showcase.visual == .sound(ContentCard.Sound(attachmentId: "66f0c0ffee0000000000c0de-audio",
                                                             url: "/f/fond.m4a", durationSeconds: nil)))
    }

    @Test func showcase_storyWithBackgroundAndText_isItsScene_paintedOnTheAuthorsFloor() throws {
        let showcase = try expectParity(#""type":"STORY","content":"Bonjour","media":[\#(Self.image)],\#(Self.effects([Self.scene("s1", [Self.backgroundImage, Self.title])]))"#)
        #expect(showcase.visual == .scene(0))
        let scene = try #require(showcase.scene)
        #expect(scene.carrierId == "66f0c0ffee0000000000c0de")
        #expect(scene.floorHex == DynamicColorGenerator.colorForName("Amani Diallo"))
    }

    @Test func showcase_storyOfSeveralScenes_isASlideshowOfScenes() throws {
        let showcase = try expectParity(#""type":"STORY","media":[\#(Self.image)],\#(Self.effects([Self.scene("s1", [Self.backgroundImage, Self.title]), Self.scene("s2", [Self.title])]))"#)
        #expect(showcase.visual == .slideshow([.scene(0), .scene(1)]))
    }

    @Test func showcase_sceneThatIsOnlyAVideo_isTheVideo() throws {
        let showcase = try expectParity(#""type":"REEL","media":[\#(Self.video)],\#(Self.effects([Self.scene("s1", [Self.backgroundVideo])]))"#)
        guard case .media(let media) = showcase.visual else {
            Issue.record("attendu la vidéo, reçu \(showcase.visual)")
            return
        }
        #expect(media.kind == .video)
    }

    @Test func showcase_sceneThatPaintsNothingButASound_isTheSound() throws {
        _ = try expectParity(#""type":"STORY","media":[\#(Self.audio)],\#(Self.effects([Self.scene("s1", [Self.colorCarrier, Self.voice])]))"#)
    }

    @Test func showcase_textOnly_isNothing() throws {
        let showcase = try expectParity(#""type":"POST","content":"Juste des mots""#)
        #expect(showcase.visual == .none)
    }
}
