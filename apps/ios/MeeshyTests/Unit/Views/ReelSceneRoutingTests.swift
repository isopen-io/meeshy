import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #6745 — **un réel composé se rejoue comme sa scène.**
///
/// La charge ci-dessous est celle du réel `6aa868a7d5f0ce06898b8222` relevé en
/// production le 2026-09-15, recopiée clé par clé (adresses de fichiers
/// omises) et décodée par le vrai décodeur. Le lecteur de réels ne lisait que
/// sa vidéo brute : ni son de fond, ni coupure voulue par l'auteur.
@MainActor
final class ReelSceneRoutingTests: XCTestCase {

    // MARK: - Qui rejoue quoi

    func test_aComposedReel_isReplayedAsItsScene() throws {
        let document = try XCTUnwrap(ReelSceneRouting.sceneDocument(for: Self.composedReel()))

        XCTAssertEqual(document.scenes.count, 1)
    }

    func test_aPlainVideoReel_keepsItsVideoPath() {
        XCTAssertNil(ReelSceneRouting.sceneDocument(for: Self.plainVideoReel()))
    }

    // MARK: - Un seul moteur pour le son de fond

    /// La scène joue son fond sur sa timeline ; si la page le jouait aussi, le
    /// lecteur entendrait la même musique deux fois, décalée.
    func test_theSceneOwnsTheBackgroundSound_thePageDoesNotPlayItASecondTime() throws {
        let reel = Self.composedReel()
        let background = try XCTUnwrap(reel.storyEffects?.resolvedBackgroundAudio)

        XCTAssertEqual(background.duration ?? 0, 19.902, accuracy: 0.001)
        XCTAssertEqual(background.mediaURL, "/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a")
        XCTAssertNil(ReelSceneRouting.borrowedSoundTrack(for: reel))
    }

    func test_aBorrowedSoundReelWithoutScene_stillPlaysThroughThePage() throws {
        let track = try XCTUnwrap(ReelSceneRouting.borrowedSoundTrack(for: Self.legacyBorrowedSoundReel()))

        XCTAssertEqual(track.soundId, "sound-1")
    }

    // MARK: - Le son de fond n'est pas le visuel du réel (#9737)

    /// Le réel de recette `6ac7e549d58b95844b6e6552` : une scène dont le seul
    /// objet est un son de FOND, et dont le seul fichier est ce son. La carte
    /// du fil y peignait le spectre du réel audio, le lecteur sa commande audio.
    func test_aComposedReelWhoseOnlyFileIsItsBackgroundSound_isShownByItsScene() throws {
        let reel = Self.backgroundSoundSceneReel()
        let background = try XCTUnwrap(reel.storyEffects?.resolvedBackgroundAudio)

        XCTAssertEqual(background.waveformSamples.count, 80)
        XCTAssertEqual(reel.primaryReelDisplayMedia?.type, .audio)
        XCTAssertNotNil(ReelSceneRouting.sceneDocument(for: reel))
        XCTAssertNil(reel.reelPrincipalAudioMedia, "ce son appartient à la scène : ni spectre, ni commande audio")
        XCTAssertTrue(SceneAudioStageRule.stagedAudios(in: reel.storyEffects?.audioPlayerObjects ?? []).isEmpty,
                      "le son de fond ne pose rien sur la scène")
        XCTAssertNil(ReelSceneRouting.borrowedSoundTrack(for: reel), "la scène le joue, la page ne le rejoue pas")
    }

    func test_aPureAudioReelWithoutScene_keepsItsSpectrumAndItsAudioControl() {
        XCTAssertEqual(Self.pureAudioReel().reelPrincipalAudioMedia?.id, Self.audioId)
        XCTAssertNil(ReelSceneRouting.sceneDocument(for: Self.pureAudioReel()))
    }

    /// La carte du fil : la scène à la place du spectre, élue comme une scène.
    func test_theFeedCard_mountsTheScene_notTheSpectrum_forASoundOfAScene() throws {
        let card = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ReelFeedCard.swift")

        XCTAssertTrue(card.contains("return post.reelSceneDocument"))
        XCTAssertTrue(card.contains("case .audio: return soundSceneDocument == nil ? .audio : .scene"))
        XCTAssertTrue(card.contains("ReelCardSceneBackdrop("))
        XCTAssertEqual(card.components(separatedBy: "ReelAudioBackdrop(").count - 1, 1,
                       "le spectre n'a qu'un montage : le réel audio sans scène ni couverture")
        XCTAssertTrue(card.contains(".reportReelFrame(id: post.id, kind: kind)"),
                      "la carte rapporte seule sa frame — le fond de scène n'en rapporte pas une seconde")
    }

    func test_theFeedCardScene_playsMutedInCardMode_andLetsTheCardTakeTheTap() throws {
        let autoplay = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedSceneAutoplay.swift")
        let start = try XCTUnwrap(autoplay.range(of: "struct ReelCardSceneBackdrop: View, Equatable {"))
        let end = try XCTUnwrap(autoplay.range(of: "struct PostSceneMosaicContainer: View {"))
        let backdrop = String(autoplay[start.upperBound..<end.lowerBound])

        XCTAssertTrue(backdrop.contains("mode: .card"), "la carte du fil est muette par construction")
        XCTAssertTrue(backdrop.contains("isPlaying: .constant(isActive)"))
        XCTAssertTrue(backdrop.contains("carrier: StoryItem(id: post.id"))
        XCTAssertTrue(backdrop.contains(".allowsHitTesting(false)"))
        XCTAssertFalse(backdrop.contains(".reportReelFrame("))
    }

    /// Le lecteur de réels : la commande audio (et le moteur de la page) ne
    /// servent que le réel dont le son EST le média.
    func test_theReelPlayer_audioControl_isForThePrincipalAudioOnly() throws {
        let player = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ReelsPlayerView.swift")

        XCTAssertTrue(player.contains("var audioMedia: FeedMedia? { reel.reelPrincipalAudioMedia }"))
        XCTAssertFalse(player.contains("guard let media = reel.primaryReelDisplayMedia, media.type == .audio"))
    }

    // MARK: - La timeline de la scène (caractérisation de la loi du SDK)

    /// Le son (19,9 s) est plus long que la vidéo (3 s, en boucle) : la scène
    /// dure jusqu'à la fin de la répétition vidéo qui couvre le son — le son
    /// joue en entier, puis reboucle avec la scène.
    func test_theSceneTimeline_coversTheWholeSound_andLoopsTheShorterVideo() throws {
        let reel = Self.composedReel()
        let carrier = StoryItem(id: reel.id, content: reel.content, media: reel.media,
                                storyEffects: reel.storyEffects, createdAt: reel.timestamp)

        let duration = carrier.toRenderableSlide(preferredLanguages: []).computedTotalDuration()

        XCTAssertEqual(duration, 21, accuracy: 0.01)
    }

    // MARK: - La progression suit la timeline de la scène

    func test_theProgress_isThePositionOnTheSceneTimeline() {
        XCTAssertEqual(ReelSceneProgress.fraction(elapsed: 10.5, duration: 21), 0.5, accuracy: 0.0001)
    }

    func test_theProgress_staysInsideTheBar_whateverThePlayerReports() {
        XCTAssertEqual(ReelSceneProgress.fraction(elapsed: 30, duration: 21), 1)
        XCTAssertEqual(ReelSceneProgress.fraction(elapsed: -1, duration: 21), 0)
        XCTAssertEqual(ReelSceneProgress.fraction(elapsed: 4, duration: 0), 0)
    }

    // MARK: - La télémétrie ne s'attribue pas le temps d'une autre vidéo

    func test_aComposedReel_takesTheSharedVideoWatch_onlyWhenTheEngineHoldsItsVideo() {
        let reel = Self.composedReel()

        XCTAssertTrue(ReelSceneRouting.attachesSharedVideoWatch(for: reel, loadedAttachmentId: Self.videoId))
        XCTAssertFalse(ReelSceneRouting.attachesSharedVideoWatch(for: reel, loadedAttachmentId: "64b0000000000000000000ff"))
        XCTAssertFalse(ReelSceneRouting.attachesSharedVideoWatch(for: reel, loadedAttachmentId: nil))
    }

    func test_aPlainVideoReel_keepsTakingTheSharedVideoWatch() {
        XCTAssertTrue(ReelSceneRouting.attachesSharedVideoWatch(for: Self.plainVideoReel(), loadedAttachmentId: nil))
    }

    // MARK: - « Sauvegarder » : UNE règle (#9681)

    func test_saveRoute_aComposedReel_isRenderedAsItsScene() {
        XCTAssertEqual(PostSaveRoute.resolve(for: Self.composedReel(), mayLeave: true), .renderScene)
    }

    func test_saveRoute_aReelWithEffectsButNoMedia_isRendered_notAbsent() {
        XCTAssertEqual(PostSaveRoute.resolve(for: Self.legacyBorrowedSoundReel(), mayLeave: true), .renderScene)
    }

    func test_saveRoute_aPlainMediaReel_keepsItsFile() {
        XCTAssertEqual(PostSaveRoute.resolve(for: Self.plainVideoReelWithAddress(), mayLeave: true),
                       .rawFile(PostSaveMedia(kind: .video, url: "https://cdn.meeshy.test/0.mov", fileName: "0_7db3dc1a.mov",
                                             authorUsername: "auteur")))
    }

    func test_saveRoute_aTextOnlyReel_isRendered_butATextOnlyPostKeepsItsBookmark() {
        XCTAssertEqual(PostSaveRoute.resolve(for: Self.textOnly(type: "REEL"), mayLeave: true), .renderScene)
        XCTAssertEqual(PostSaveRoute.resolve(for: Self.textOnly(type: "POST"), mayLeave: true), .unavailable)
    }

    /// La loi de sortie gagne sur tout : un portillon fermé n'enregistre RIEN, ni
    /// scène rendue, ni fichier.
    func test_saveRoute_aClosedExitGate_savesNothing() {
        for reel in [Self.composedReel(), Self.plainVideoReelWithAddress(), Self.textOnly(type: "REEL")] {
            XCTAssertEqual(PostSaveRoute.resolve(for: reel, mayLeave: false), .unavailable)
        }
    }

    func test_saveAction_followsTheGateOfTheHostCoordinator() {
        XCTAssertEqual(PostSaveAction.route(for: Self.composedReel(), coordinator: MediaSaveCoordinator()), .unavailable,
                       "un coordinateur sans portillon refuse — fermé par défaut")
        XCTAssertEqual(PostSaveAction.route(for: Self.composedReel(), coordinator: MediaSaveCoordinator(exitGate: .open)),
                       .renderScene)
    }

    /// Le réel part par le MÊME bake qu'une story : la scène 0 du document, son
    /// de fond compris, sans carte de fin, job clé sur l'id du post, écrit dans Photos.
    func test_savePost_bakesTheReelSceneWithItsBackgroundSound_likeAStory() async {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let sut = StoryPhotoSaveService(exporter: exporter, photoSaver: photos, toasts: MockFeedbackToast(),
                                        preferredLanguages: { [] }, intro: { nil })
        let reel = Self.composedReel()

        sut.save(post: reel)
        XCTAssertNotNil(sut.progress(for: reel.id), "l'anneau du réel se lit sur l'id du post")
        for _ in 0..<200 where sut.progress(for: reel.id) != nil { await Task.yield() }

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(exporter.lastAppendsBrandOutro, false, "l'œuvre seule, comme une scène de post")
        XCTAssertNil(exporter.lastIntro)
        XCTAssertEqual(exporter.lastSlide?.effects.resolvedBackgroundAudio?.mediaURL,
                       "/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a",
                       "le son de fond du réel part dans le MP4")
        XCTAssertEqual(photos.savedVideoURLs.count, 1)
    }

    // MARK: - Un réel à plusieurs scènes s'enregistre ENTIER (#9681)

    func test_renderableSlides_oneSlidePerScene_inTheDocumentOrder() {
        XCTAssertEqual(StoryPhotoSaveService.renderableSlides(of: Self.twoSceneReel(), preferredLanguages: []).count, 2)
        XCTAssertEqual(StoryPhotoSaveService.renderableSlides(of: Self.composedReel(), preferredLanguages: []).count, 1)
    }

    func test_savePost_aTwoSceneReel_bakesBothScenes_thenJoinsThemInOneVideo() async {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let joined = JoinedParts()
        let sut = StoryPhotoSaveService(exporter: exporter, photoSaver: photos, toasts: MockFeedbackToast(),
                                        preferredLanguages: { [] }, intro: { nil },
                                        concatenate: { parts, output in
                                            joined.counts.append(parts.count)
                                            return FileManager.default.createFile(atPath: output.path, contents: Data())
                                        })
        let reel = Self.twoSceneReel()

        sut.save(post: reel)
        for _ in 0..<400 where sut.progress(for: reel.id) != nil { await Task.yield() }

        XCTAssertEqual(exporter.prepareCallCount, 2, "chaque scène passe par le moteur")
        XCTAssertEqual(joined.counts, [2], "puis les deux morceaux s'enchaînent en UN fichier")
        XCTAssertEqual(exporter.lastAppendsBrandOutro, false)
        XCTAssertEqual(photos.savedVideoURLs.count, 1, "Photos reçoit UNE vidéo, la suite entière")
        XCTAssertGreaterThanOrEqual(exporter.cleanupCallCount, 2, "les morceaux intermédiaires sont jetés")
    }

    // MARK: - Le filigrane nomme l'AUTEUR (recette #9681, 2026-10-08)

    func test_savePost_watermarksTheReelAuthor_notTheViewerWhoSaves() async {
        let handles = JoinedHandles()
        let sut = StoryPhotoSaveService(exporter: ScriptedStoryExporter(), photoSaver: StubPhotoSaver(),
                                        toasts: MockFeedbackToast(), preferredLanguages: { [] }, intro: { nil },
                                        watermark: { handle in handles.values.append(handle); return nil })
        let reel = Self.composedReel()
        XCTAssertNotEqual(AuthManager.shared.currentUser?.username, "auteur", "auteur et spectateur diffèrent")

        sut.save(post: reel)
        for _ in 0..<200 where sut.progress(for: reel.id) != nil { await Task.yield() }

        XCTAssertEqual(handles.values, ["auteur"], "le réel de @auteur sort signé @auteur")
    }

    func test_saveStory_ofAnotherAuthor_watermarksThatAuthor_withoutTheViewerInterlude() async {
        let handles = JoinedHandles()
        let exporter = ScriptedStoryExporter()
        let sut = StoryPhotoSaveService(exporter: exporter, photoSaver: StubPhotoSaver(),
                                        toasts: MockFeedbackToast(), preferredLanguages: { [] },
                                        intro: { XCTFail("l'interlude du spectateur ne précède pas la story d'un autre"); return nil },
                                        watermark: { handle in handles.values.append(handle); return nil })
        let story = StoryItem(id: "story-9681", content: "x", media: [], storyEffects: nil, createdAt: Date())

        sut.save(story: story, authorUsername: "demo-test-staging")
        for _ in 0..<200 where sut.progress(for: story.id) != nil { await Task.yield() }

        XCTAssertEqual(handles.values, ["demo-test-staging"])
        XCTAssertNil(exporter.lastIntro)
    }

    // MARK: - Partager emporte aussi le fichier, rendu à la demande (#9682)

    func test_shareFile_onlyFileActivitiesPayTheRender() {
        XCTAssertTrue(ShareFileActivity.wantsFile(UIActivity.ActivityType.saveToCameraRoll.rawValue))
        XCTAssertTrue(ShareFileActivity.wantsFile(UIActivity.ActivityType.airDrop.rawValue))
        XCTAssertTrue(ShareFileActivity.wantsFile("com.apple.DocumentManagerUICore.SaveToFiles"))
        XCTAssertFalse(ShareFileActivity.wantsFile(UIActivity.ActivityType.message.rawValue))
        XCTAssertFalse(ShareFileActivity.wantsFile(UIActivity.ActivityType.copyToPasteboard.rawValue))
        XCTAssertFalse(ShareFileActivity.wantsFile(nil))
    }

    /// Recette #9682 : un lien http À CÔTÉ du fichier (« 1 Link and 1 Document »)
    /// cachait « Enregistrer dans Fichiers ». UN élément, qui rend le fichier aux
    /// activités de fichier et le lien aux autres.
    func test_shareItems_aComposedReel_isOneSource_fileForFileActivities_linkForTheOthers() throws {
        let url = try XCTUnwrap(URL(string: "https://meeshy.me/l/abc"))
        let items = ShareableLink(url: url, fileSource: .post(Self.composedReel())).activityItems

        XCTAssertEqual(items.count, 1, "aucun lien http à côté du fichier")
        let provider = try XCTUnwrap(items.first as? LazyShareFileProvider)
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        XCTAssertEqual(provider.activityViewController(sheet, itemForActivityType: .message) as? URL, url,
                       "Messages reçoit le lien")
        XCTAssertEqual(provider.activityViewController(sheet, itemForActivityType: .copyToPasteboard) as? URL, url)
        let placeholder = try XCTUnwrap(provider.placeholderItem as? URL)
        XCTAssertEqual(placeholder.lastPathComponent, "Meeshy-6aa868a7d5f0ce06898b8222.mp4")
        XCTAssertTrue(UIVideoAtPathIsCompatibleWithSavedPhotosAlbum(placeholder.path),
                      "un VRAI fichier vidéo : « Enregistrer la vidéo » peut paraître")
    }

    func test_shareItems_nothingToCarry_staysTheLinkAlone() throws {
        let url = try XCTUnwrap(URL(string: "https://meeshy.me/l/abc"))
        XCTAssertEqual(ShareableLink(url: url).activityItems.count, 1)
        XCTAssertEqual(ShareableLink(url: url, fileSource: .post(Self.textOnly(type: "POST"))).activityItems.count, 1)
    }

    /// Paresseux : rien n'est rendu à la construction, ni pour une activité de LIEN.
    func test_shareFileProvider_rendersNothingUntilAFileActivityIsChosen() throws {
        let placeholder = try XCTUnwrap(ShareFilePlaceholder.video(named: "Meeshy-x.mp4"))
        let link = try XCTUnwrap(URL(string: "https://meeshy.me/l/abc"))
        let provider = LazyShareFileProvider(placeholder: placeholder, typeIdentifier: "public.mpeg-4", link: link) {
            XCTFail("aucun rendu tant qu'aucune activité de fichier n'est choisie")
            return nil
        }
        let sheet = UIActivityViewController(activityItems: [provider], applicationActivities: nil)

        XCTAssertEqual(provider.activityViewController(sheet, itemForActivityType: .message) as? URL, link)
        XCTAssertEqual(provider.activityViewController(sheet, itemForActivityType: .copyToPasteboard) as? URL, link)
        XCTAssertEqual(provider.activityViewController(sheet, dataTypeIdentifierForActivityType: .saveToCameraRoll),
                       "public.mpeg-4")
    }

    // MARK: - Fixtures

    private static let videoId = "6aa868a7d5f0ce06898b8220"

    private static let videoMedia = """
    {"id":"\(videoId)","fileName":"0_7db3dc1a.mov","originalName":"0.mov",
     "mimeType":"video/quicktime","fileSize":6074789,"width":1920,"height":1080,
     "thumbHash":"IAgKDABZ9Xj5eXlYaHhzXX+G9g==","duration":3000,"order":0}
    """

    private static func composedReel() -> FeedPost {
        let post: APIPost = JSONStub.decode("""
        {"id":"6aa868a7d5f0ce06898b8222","type":"REEL","content":"","createdAt":"2026-09-14T21:35:35.412Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"},
         "media":[\(videoMedia)],
         "storyEffects":{"v":3,"scenes":[{"id":"s1","objects":[
           {"id":"bg","kind":"media","plane":"bg","z":0,
            "anchor":{"t":"free","x":0.5,"y":0.5},
            "transform":{"rotation":0,"opacity":1,"scale":1},
            "payload":{"transform":{"videoFitMode":"fill"}}},
           {"id":"D2686BB9-02E2-4B2B-8E14-735042780017","kind":"media","plane":"content","z":1,"locale":"fr",
            "anchor":{"t":"free","x":0.5,"y":0.5},
            "transform":{"rotation":0,"opacity":1,"scale":1},
            "payload":{"loop":true,"duration":3,"postMediaId":"\(videoId)","mutedVolumeMemento":1,
                       "mediaType":"video","muted":true,"intrinsicDuration":3,"isBackground":true,
                       "aspectRatio":0.5625,"volume":0}},
           {"id":"C69078CA-1777-4797-B725-28EBD56FA1EB","kind":"audio","plane":"content","z":2,"locale":"fr",
            "anchor":{"t":"free","x":0.5,"y":0.65},
            "transform":{"rotation":0,"opacity":1,"scale":1},
            "payload":{"placement":"overlay","soundAuthorUsername":"elvirandjiki","postMediaId":null,
                       "duration":19.902,"mediaURL":"/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a",
                       "soundId":"6a9a7b41e19ad1985081de32","isBackground":true}}
         ]}]}}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    private static let audioId = "6ac7e549d58b95844b6e6550"

    private static let audioMedia = """
    {"id":"\(audioId)","fileName":"son.m4a","originalName":"son.m4a",
     "mimeType":"audio/mp4","fileSize":204800,"duration":8000,"order":0}
    """

    private static func backgroundSoundSceneReel() -> FeedPost {
        let samples = Array(repeating: "0.5", count: 80).joined(separator: ",")
        let post: APIPost = JSONStub.decode("""
        {"id":"6ac7e549d58b95844b6e6552","type":"REEL","content":"Recette 9677 · réel à son ORIGINAL",
         "createdAt":"2026-10-08T10:00:00.000Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"},
         "media":[\(audioMedia)],
         "storyEffects":{"v":3,"scenes":[{"id":"s1","objects":[
           {"id":"A1","kind":"audio","plane":"content","z":0,
            "anchor":{"t":"free","x":0.5,"y":0.5},
            "transform":{"rotation":0,"opacity":1,"scale":1},
            "payload":{"placement":"background","postMediaId":"\(audioId)","duration":8,
                       "waveformSamples":[\(samples)],"isBackground":true}}
         ]}]}}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    private static func pureAudioReel() -> FeedPost {
        let post: APIPost = JSONStub.decode("""
        {"id":"6ac7e549d58b95844b6e6553","type":"REEL","content":"","createdAt":"2026-10-08T10:00:00.000Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"},
         "media":[\(audioMedia)]}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    private static func plainVideoReel() -> FeedPost {
        let post: APIPost = JSONStub.decode("""
        {"id":"6aa868a7d5f0ce06898b8299","type":"REEL","content":"","createdAt":"2026-09-14T21:35:35.412Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"},
         "media":[\(videoMedia)]}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    private static func twoSceneReel() -> FeedPost {
        let scene = #"""
        {"id":"s1","objects":[
           {"id":"bg","kind":"media","plane":"bg","z":0,
            "anchor":{"t":"free","x":0.5,"y":0.5},
            "transform":{"rotation":0,"opacity":1,"scale":1},
            "payload":{"transform":{"videoFitMode":"fill"}}},
           {"id":"D2686BB9-02E2-4B2B-8E14-735042780017","kind":"media","plane":"content","z":1,"locale":"fr",
            "anchor":{"t":"free","x":0.5,"y":0.5},
            "transform":{"rotation":0,"opacity":1,"scale":1},
            "payload":{"loop":true,"duration":3,"postMediaId":"6aa868a7d5f0ce06898b8220","mutedVolumeMemento":1,
                       "mediaType":"video","muted":true,"intrinsicDuration":3,"isBackground":true,
                       "aspectRatio":0.5625,"volume":0}},
           {"id":"C69078CA-1777-4797-B725-28EBD56FA1EB","kind":"audio","plane":"content","z":2,"locale":"fr",
            "anchor":{"t":"free","x":0.5,"y":0.65},
            "transform":{"rotation":0,"opacity":1,"scale":1},
            "payload":{"placement":"overlay","soundAuthorUsername":"elvirandjiki","postMediaId":null,
                       "duration":19.902,"mediaURL":"/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a",
                       "soundId":"6a9a7b41e19ad1985081de32","isBackground":true}}
         ]}
        """#
        let post: APIPost = JSONStub.decode("""
        {"id":"6aa868a7d5f0ce06898b8295","type":"REEL","content":"","createdAt":"2026-09-14T21:35:35.412Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"},
         "media":[\(videoMedia)],
         "storyEffects":{"v":3,"scenes":[\(scene),\(scene.replacingOccurrences(of: "\"id\":\"s1\"", with: "\"id\":\"s2\""))]}}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    private static func plainVideoReelWithAddress() -> FeedPost {
        let post: APIPost = JSONStub.decode("""
        {"id":"6aa868a7d5f0ce06898b8297","type":"REEL","content":"","createdAt":"2026-09-14T21:35:35.412Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"},
         "media":[{"id":"\(videoId)","fileName":"0_7db3dc1a.mov","mimeType":"video/quicktime",
                   "fileUrl":"https://cdn.meeshy.test/0.mov","duration":3000,"order":0}]}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    private static func textOnly(type: String) -> FeedPost {
        let post: APIPost = JSONStub.decode("""
        {"id":"6aa868a7d5f0ce06898b8296","type":"\(type)","content":"Bonjour","createdAt":"2026-09-14T21:35:35.412Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"}}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    /// Un réel « son de bibliothèque seul » à l'ancienne forme : aucun média,
    /// aucune scène, un fond emprunté dans `audioPlayerObjects`.
    private static func legacyBorrowedSoundReel() -> FeedPost {
        let post: APIPost = JSONStub.decode("""
        {"id":"6aa868a7d5f0ce06898b8298","type":"REEL","content":"","createdAt":"2026-09-14T21:35:35.412Z",
         "author":{"id":"68f33afa8ae497b2054c84d7","username":"auteur"}}
        """)
        var reel = post.toFeedPost(preferredLanguages: [])
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "borrowed", postMediaId: "", placement: "background",
                                   isBackground: true,
                                   mediaURL: "/api/v1/static/emprunte.m4a",
                                   soundId: "sound-1"),
        ]
        reel.storyEffects = effects
        return reel
    }
}

/// Les morceaux remis à l'enchaînement, un relevé par appel.
private final class JoinedParts: @unchecked Sendable {
    var counts: [Int] = []
}

/// Les pseudos remis au filigrane, un par rendu.
private final class JoinedHandles: @unchecked Sendable {
    var values: [String?] = []
}
