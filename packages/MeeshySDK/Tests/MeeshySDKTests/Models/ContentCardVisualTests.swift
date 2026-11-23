import Foundation
import Testing
@testable import MeeshySDK

/// **Ce que le bloc visuel de la carte d'un contenu montre** (#20211) — la
/// règle du porteur, dans son ordre : plusieurs médias se font glisser, une
/// vidéo montre son image de garde, un son seul se joue, et sinon la scène
/// composée se dessine, fond et objets posés.
struct ContentCardVisualTests {

    private static let author = #"{"id":"6ada27bf28983c39d9838be9","username":"amani","displayName":"Amani Diallo"}"#

    private func card(_ fields: String) throws -> ContentCard {
        let json = #"{"id":"66f0c0ffee0000000000c0de","createdAt":"2026-11-04T09:55:10.287Z","author":\#(Self.author),\#(fields)}"#
        let post = try MeeshyCoders.decoder(.api).decode(APIPost.self, from: Data(json.utf8))
        return ContentCard(post: post, preferredLanguages: [])
    }

    private static func object(_ id: String, kind: String, plane: String = "content", payload: String) -> String {
        #"{"id":"\#(id)","kind":"\#(kind)","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"\#(plane)","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":\#(payload)}"#
    }

    private static func scene(_ id: String, _ objects: [String]) -> String {
        #"{"id":"\#(id)","objects":[\#(objects.joined(separator: ","))]}"#
    }

    private static func effects(_ scenes: [String], sound: String? = nil) -> String {
        let soundField = sound.map { #","sound":\#($0)"# } ?? ""
        return #""storyEffects":{"v":3,"scenes":[\#(scenes.joined(separator: ","))]\#(soundField)}"#
    }

    private static let backgroundImage = object("bg", kind: "media", payload: #"{"postMediaId":"m-img","mediaType":"image","isBackground":true}"#)
    private static let backgroundVideo = object("bg", kind: "media", payload: #"{"postMediaId":"m-vid","mediaType":"video","isBackground":true}"#)
    private static let colorCarrier = object("bg", kind: "media", plane: "bg", payload: ##"{"backgroundColor":"#1E1B4B"}"##)
    private static let title = object("t1", kind: "text", plane: "fg", payload: #"{"text":"Bonjour"}"#)
    private static let voice = object("a1", kind: "audio", plane: "fg", payload: #"{"postMediaId":"m-aud"}"#)

    private static let image = #"{"id":"m-img","mimeType":"image/jpeg","fileUrl":"/f/i.jpg","thumbnailUrl":"/t/i.jpg"}"#
    private static let video = #"{"id":"m-vid","mimeType":"video/mp4","fileUrl":"/f/v.mp4","thumbnailUrl":"/t/v.jpg","duration":12000}"#
    private static let audio = #"{"id":"m-aud","mimeType":"audio/mpeg","fileUrl":"/f/a.mp3","duration":31000}"#

    // MARK: - Plusieurs médias : un diaporama

    @Test func visual_postWithSeveralImagesAndVideos_isASlideshowOfEveryVisualMedia_inOrder() throws {
        let several = try card(#""type":"POST","media":[\#(Self.image),\#(Self.audio),\#(Self.video)]"#)
        guard case .slideshow(let pages) = several.visual else {
            Issue.record("attendu un diaporama, reçu \(several.visual)")
            return
        }
        #expect(pages.count == 2)
        #expect(pages.first == .media(try #require(several.media)))
        guard case .media(let second)? = pages.last else {
            Issue.record("la seconde page devrait être la vidéo")
            return
        }
        #expect(second.kind == .video)
        #expect(second.imageURL == "/t/v.jpg")
    }

    @Test func visual_reelWithSeveralClips_isASlideshow_inPortrait() throws {
        let reel = try card(#""type":"REEL","media":[\#(Self.video),\#(Self.video.replacingOccurrences(of: "m-vid", with: "m-vid2"))]"#)
        guard case .slideshow(let pages) = reel.visual else {
            Issue.record("attendu un diaporama, reçu \(reel.visual)")
            return
        }
        #expect(pages.count == 2)
        #expect(pages.allSatisfy { page in
            if case .media(let media) = page { return media.aspectRatio == ContentCard.portraitAspectRatio }
            return false
        })
    }

    @Test func visual_documentWithSeveralScenes_isASlideshowOfItsScenes() throws {
        let story = try card(#""type":"STORY","media":[\#(Self.image)],\#(Self.effects([Self.scene("s1", [Self.backgroundImage, Self.title]), Self.scene("s2", [Self.title])]))"#)
        #expect(story.visual == .slideshow([.scene(0), .scene(1)]))
        #expect(story.scene != nil)
    }

    // MARK: - Une vidéo : son image de garde

    @Test func visual_singleVideoPost_isTheVideo_withItsPoster() throws {
        let single = try card(#""type":"POST","media":[\#(Self.video)]"#)
        guard case .media(let media) = single.visual else {
            Issue.record("attendu la vidéo, reçu \(single.visual)")
            return
        }
        #expect(media.kind == .video)
        #expect(media.imageURL == "/t/v.jpg")
    }

    @Test func visual_sceneThatIsOnlyAVideo_isTheVideoPoster_notAScene() throws {
        let reel = try card(#""type":"REEL","media":[\#(Self.video)],\#(Self.effects([Self.scene("s1", [Self.backgroundVideo])]))"#)
        guard case .media(let media) = reel.visual else {
            Issue.record("attendu la vidéo, reçu \(reel.visual)")
            return
        }
        #expect(media.kind == .video)
    }

    @Test func visual_singleImagePost_isTheImage() throws {
        let single = try card(#""type":"POST","media":[\#(Self.image)]"#)
        #expect(single.visual == .media(try #require(single.media)))
    }

    // MARK: - Un son de fond seul : le composant sonore

    @Test func visual_audioOnlyPost_isTheSound_withItsDurationInSeconds() throws {
        let voiceNote = try card(#""type":"POST","content":"Écoutez","media":[\#(Self.audio)]"#)
        #expect(voiceNote.visual == .sound(ContentCard.Sound(attachmentId: "m-aud", url: "/f/a.mp3", durationSeconds: 31)))
    }

    @Test func visual_moodWithOnlyABackgroundSound_isTheSound() throws {
        let mood = try card(#""type":"STATUS","moodEmoji":"🎧","audioUrl":"/f/fond.m4a","audioDuration":8000"#)
        #expect(mood.visual == .sound(ContentCard.Sound(attachmentId: "66f0c0ffee0000000000c0de-audio", url: "/f/fond.m4a", durationSeconds: 8)))
    }

    @Test func visual_sceneThatPaintsNothingButCarriesASound_isTheSound() throws {
        let story = try card(#""type":"STORY","media":[\#(Self.audio)],\#(Self.effects([Self.scene("s1", [Self.colorCarrier, Self.voice])]))"#)
        #expect(story.visual == .sound(ContentCard.Sound(attachmentId: "m-aud", url: "/f/a.mp3", durationSeconds: 31)))
    }

    // MARK: - Sinon : la scène, fond et objets posés

    @Test func visual_storyWithABackgroundAndText_isItsScene() throws {
        let story = try card(#""type":"STORY","media":[\#(Self.image)],\#(Self.effects([Self.scene("s1", [Self.backgroundImage, Self.title])]))"#)
        #expect(story.visual == .scene(0))
        let scene = try #require(story.scene)
        #expect(scene.document.scenes.count == 1)
        #expect(scene.media.map(\.id) == ["m-img"])
    }

    @Test func visual_textOnlyMoodScene_isItsScene_notNothing() throws {
        let mood = try card(#""type":"STATUS","moodEmoji":"🌞",\#(Self.effects([Self.scene("s1", [Self.colorCarrier, Self.title])]))"#)
        #expect(mood.visual == .scene(0))
    }

    @Test func visual_videoUnderText_isTheScene_becauseTheTextIsPartOfWhatWasComposed() throws {
        let story = try card(#""type":"STORY","media":[\#(Self.video)],\#(Self.effects([Self.scene("s1", [Self.backgroundVideo, Self.title])]))"#)
        #expect(story.visual == .scene(0))
    }

    @Test func visual_bareRepostOfAStory_drawsTheOriginalsScene() throws {
        let repost = try card(#""type":"POST","content":null,"repostOf":{"id":"66f0c0ffee0000000000beef","type":"STORY","createdAt":"2026-11-01T08:00:00.000Z","author":{"id":"o1","username":"lume"},"media":[\#(Self.image)],\#(Self.effects([Self.scene("s1", [Self.backgroundImage, Self.title])]))}"#)
        #expect(repost.visual == .scene(0))
        #expect(repost.scene?.carrierId == "66f0c0ffee0000000000beef")
    }

    // MARK: - Rien à montrer

    @Test func visual_textOnlyPost_isNothing() throws {
        let text = try card(#""type":"POST","content":"Juste des mots""#)
        #expect(text.visual == .none)
        #expect(text.scene == nil)
    }
}
