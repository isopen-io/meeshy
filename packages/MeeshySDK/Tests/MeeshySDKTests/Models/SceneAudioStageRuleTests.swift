import Testing
import Foundation
import CoreGraphics
@testable import MeeshySDK

/// #9737 — **le son de FOND ne produit aucun pixel sur la scène ; seul le son
/// de PREMIER PLAN y paraît, en pastille, là où le composeur l'a posé.**
@Suite("SceneAudioStageRule")
struct SceneAudioStageRuleTests {

    private func background(id: String = "bg") -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: id, x: 0.5, y: 0.5,
                               waveformSamples: Array(repeating: 0.6, count: 80),
                               isBackground: true)
    }

    @Test("un son de fond n'est pas sur la scène, même avec sa forme d'onde")
    func backgroundIsOffStage() {
        #expect(SceneAudioStageRule.presence(of: background()) == .offStage)
        #expect(SceneAudioStageRule.isStaged(background()) == false)
    }

    @Test("un son de fond emprunté à la bibliothèque n'est pas sur la scène non plus")
    func borrowedBackgroundIsOffStage() {
        var fond = background()
        fond.soundId = "sound-1"

        #expect(SceneAudioStageRule.presence(of: fond) == .offStage)
    }

    @Test("un son de premier plan est une pastille à sa place, échelle 1 et rotation 0 par défaut")
    func foregroundIsAChipAtItsPlace() {
        let pose = StoryAudioPlayerObject(id: "fg", x: 0.25, y: 0.75)

        #expect(SceneAudioStageRule.presence(of: pose)
                == .chip(SceneAudioChipPose(x: 0.25, y: 0.75, scale: 1, rotation: 0)))
    }

    @Test("isBackground absent ou faux : le son est de premier plan")
    func absentOrFalseFlagIsForeground() {
        var explicite = StoryAudioPlayerObject(id: "fg")
        explicite.isBackground = false

        #expect(SceneAudioStageRule.isStaged(StoryAudioPlayerObject(id: "nil")))
        #expect(SceneAudioStageRule.isStaged(explicite))
    }

    @Test("la pastille garde l'échelle et la rotation choisies au composeur")
    func chipKeepsItsScaleAndRotation() {
        var pose = StoryAudioPlayerObject(id: "fg", x: 0.4, y: 0.6)
        pose.scale = 1.8
        pose.rotation = 0.35

        #expect(SceneAudioStageRule.presence(of: pose)
                == .chip(SceneAudioChipPose(x: 0.4, y: 0.6, scale: 1.8, rotation: 0.35)))
    }

    @Test("d'une scène, seuls les sons de premier plan paraissent, dans l'ordre du document")
    func stagedAudiosKeepsForegroundInOrder() {
        let audios = [StoryAudioPlayerObject(id: "a"), background(), StoryAudioPlayerObject(id: "b")]

        #expect(SceneAudioStageRule.stagedAudios(in: audios).map(\.id) == ["a", "b"])
    }

    @Test("une scène qui ne porte qu'un son de fond ne montre aucun son")
    func aSceneWithOnlyABackgroundSoundStagesNothing() {
        #expect(SceneAudioStageRule.stagedAudios(in: [background()]).isEmpty)
    }

    // MARK: - Le visuel d'un réel dont le média est un son

    private func reel(media: [FeedMedia], scenes: [SceneV3]?) -> FeedPost {
        var post = FeedPost(author: "auteur", authorId: "u1", type: "REEL", content: "", media: media)
        if let scenes {
            var effects = StoryEffects()
            effects.audioPlayerObjects = [background()]
            effects.canvasV3 = CanvasV3(scenes: scenes)
            post.storyEffects = effects
        }
        return post
    }

    private var sound: FeedMedia { FeedMedia(id: "m-audio", type: .audio, url: "/son.m4a", duration: 12_000) }

    @Test("un réel composé dont le seul fichier est son son de fond se montre par sa scène, pas par un spectre")
    func aComposedReelWithOnlyItsBackgroundSoundIsShownByItsScene() {
        let post = reel(media: [sound], scenes: [SceneV3(id: "s1", objects: [])])

        #expect(post.reelSceneDocument?.scenes.count == 1)
        #expect(post.reelPrincipalAudioMedia == nil)
    }

    @Test("un réel purement audio, sans scène, garde son son pour média principal")
    func aPureAudioReelKeepsItsSoundAsPrincipalMedium() {
        let post = reel(media: [sound], scenes: nil)

        #expect(post.reelSceneDocument == nil)
        #expect(post.reelPrincipalAudioMedia?.id == "m-audio")
    }

    @Test("un document sans scène ne fait pas un réel composé")
    func anEmptyDocumentIsNotAScene() {
        let post = reel(media: [sound], scenes: [])

        #expect(post.reelSceneDocument == nil)
        #expect(post.reelPrincipalAudioMedia?.id == "m-audio")
    }

    // MARK: - La forme (aucune n'est proposée au composeur : capsule)

    @Test("toute pastille est une capsule tant qu'aucune forme n'est choisie au composeur")
    func everyChipIsACapsule() {
        guard case .chip(let pose) = SceneAudioStageRule.presence(of: StoryAudioPlayerObject(id: "fg")) else {
            Issue.record("un son de premier plan est une pastille")
            return
        }
        #expect(pose.shape == .capsule)
    }

    // MARK: - Un réel composé REPUBLIÉ rejoue la scène de sa source

    private func republished(own: StoryEffects? = nil, ownMedia: [FeedMedia] = []) -> FeedPost {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [background()]
        effects.canvasV3 = CanvasV3(scenes: [SceneV3(id: "s1", objects: [])])
        let source = RepostContent(id: "source", author: "origine", content: "légende d'origine",
                                   type: "REEL", storyEffects: effects, media: [sound])
        var post = FeedPost(id: "enveloppe", author: "relais", authorId: "u2", type: "REEL", content: "",
                            repost: source, media: ownMedia)
        post.storyEffects = own
        return post
    }

    @Test("une enveloppe vide joue la scène du réel qu'elle republie, médias et effets d'un seul tenant")
    func anEmptyEnvelopePlaysTheSourceScene() {
        let post = republished()

        #expect(post.reelPlayedSceneDocument?.scenes.count == 1)
        #expect(post.reelPlayedSceneCarrier.id == "enveloppe")
        #expect(post.reelPlayedSceneCarrier.media.map(\.id) == ["m-audio"])
        #expect(post.reelPlayedSceneCarrier.storyEffects?.canvasV3 != nil)
        #expect(post.reelPlayedSceneCarrier.content == "légende d'origine")
    }

    @Test("une republication qui porte son propre média ne joue pas la scène de sa source")
    func anEnvelopeWithItsOwnContentKeepsIt() {
        let post = republished(ownMedia: [FeedMedia(id: "mine", type: .image, url: "/i.jpg")])

        #expect(post.reelPlayedSceneDocument == nil)
        #expect(post.reelPlayedSceneCarrier.media.map(\.id) == ["mine"])
    }

    @Test("un réel composé joue sa propre scène, avec ses propres médias")
    func aComposedReelPlaysItsOwnScene() {
        let post = reel(media: [sound], scenes: [SceneV3(id: "s1", objects: [])])

        #expect(post.reelPlayedSceneDocument == post.reelSceneDocument)
        #expect(post.reelPlayedSceneCarrier.media.map(\.id) == ["m-audio"])
    }

    @Test("un réel vidéo n'a pas de son principal")
    func aVideoReelHasNoPrincipalAudio() {
        let post = reel(media: [FeedMedia(id: "v", type: .video, url: "/v.mp4"), sound], scenes: nil)

        #expect(post.reelPrincipalAudioMedia == nil)
    }
}
