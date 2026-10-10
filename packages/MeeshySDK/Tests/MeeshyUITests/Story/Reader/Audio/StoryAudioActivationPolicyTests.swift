import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

final class StoryAudioActivationPolicyTests: XCTestCase {

    private struct SignatureIntrouvable: Error {
        let signature: String
    }

    func test_uneScenesSansSon_neDemandePasLaSession() {
        XCTAssertFalse(StoryAudioActivationPolicy.shouldActivate(hasClips: false, hasSoundingVideo: false, mute: false))
    }

    func test_uneSceneMuette_neDemandePasLaSession_memeAvecDesPistes() {
        XCTAssertFalse(StoryAudioActivationPolicy.shouldActivate(hasClips: true, hasSoundingVideo: true, mute: true))
    }

    func test_unePisteAudible_demandeLaSession() {
        XCTAssertTrue(StoryAudioActivationPolicy.shouldActivate(hasClips: true, hasSoundingVideo: false, mute: false))
    }

    func test_uneVideoSonore_demandeLaSession_sansPisteAuMixer() {
        XCTAssertTrue(StoryAudioActivationPolicy.shouldActivate(hasClips: false, hasSoundingVideo: true, mute: false))
    }

    func test_unMuetVerrouille_nePreparePasLeSon() {
        XCTAssertFalse(StoryAudioActivationPolicy.shouldPrepare(mute: true, muteIsLocked: true))
    }

    func test_unMuetLevable_prepareLeSon_pourUnRetourInstantane() {
        XCTAssertTrue(StoryAudioActivationPolicy.shouldPrepare(mute: true, muteIsLocked: false))
    }

    func test_uneSurfaceVerrouilleeSonore_prepareLeSon() {
        XCTAssertTrue(StoryAudioActivationPolicy.shouldPrepare(mute: false, muteIsLocked: true))
    }

    func test_leMoteurMuetAvecDesPistes_resteAuRepos() {
        XCTAssertTrue(StoryAudioActivationPolicy.shouldHoldEngine(hasClips: true, isMuted: true))
        XCTAssertFalse(StoryAudioActivationPolicy.shouldHoldEngine(hasClips: true, isMuted: false))
        XCTAssertFalse(StoryAudioActivationPolicy.shouldHoldEngine(hasClips: false, isMuted: true),
                       "une passe silencieuse ne démarre aucun moteur : elle reste une passe, pas une retenue")
    }

    func test_leContexte_garde_sonVerrou_quandLaLangueChange() {
        let carte = StoryReaderContext(preferredLanguages: ["fr"], mute: true, locksMute: true)
        XCTAssertTrue(carte.withPreferredLanguages(["en"]).locksMute)
    }

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func corps(de signature: String, dans code: String) throws -> String {
        guard let debut = code.range(of: signature) else {
            throw SignatureIntrouvable(signature: signature)
        }
        let reste = code[debut.lowerBound...]
        guard let fin = reste.range(of: "\n    }\n") else { return String(reste) }
        return String(reste[..<fin.upperBound])
    }

    private var canvasAudio: String {
        get throws { try source("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Audio.swift") }
    }

    func test_laDemandeDeSession_consulteLaPolitique() throws {
        let corps = try corps(de: "func requestPlaybackSessionIfNeeded()", dans: canvasAudio)
        let politique = try XCTUnwrap(corps.range(of: "StoryAudioActivationPolicy.shouldActivate("))
        let demande = try XCTUnwrap(corps.range(of: "MediaSessionCoordinator.shared.request("))
        XCTAssertLessThan(politique.lowerBound, demande.lowerBound)
    }

    func test_laPreparation_consulteLaPolitique_avantToutTelechargement() throws {
        let corps = try corps(de: "func reconfigureAudioForPlayback()", dans: canvasAudio)
        let politique = try XCTUnwrap(corps.range(of: "StoryAudioActivationPolicy.shouldPrepare("))
        let cache = try XCTUnwrap(corps.range(of: "cachedAudioFileURL("))
        XCTAssertLessThan(politique.lowerBound, cache.lowerBound)
    }

    func test_laRetenueDeLaTimeline_consulteLaPolitique() throws {
        let corps = try corps(de: "func isSlideAudioPending()", dans: canvasAudio)
        XCTAssertTrue(corps.contains("StoryAudioActivationPolicy.shouldActivate("))
    }

    func test_lePlayDuMixer_consulteLaPolitique_avantDeDemarrerLeMoteur() throws {
        let mixer = try source("Sources/MeeshyUI/Story/ReaderAudioMixer.swift")
        let corps = try corps(de: "public func play(originHost: UInt64, slideKey: String", dans: mixer)
        let politique = try XCTUnwrap(corps.range(of: "StoryAudioActivationPolicy.shouldHoldEngine("))
        let demarrage = try XCTUnwrap(corps.range(of: "try engine.start()"))
        XCTAssertLessThan(politique.lowerBound, demarrage.lowerBound)
    }
}

@MainActor
final class StoryCanvasAudioActivationTests: XCTestCase {

    private final class Demandes: @unchecked Sendable {
        private let verrou = NSLock()
        private var ids: [String] = []

        func note(_ id: String) {
            verrou.lock()
            ids.append(id)
            verrou.unlock()
        }

        func nombre(pour id: String) -> Int {
            verrou.lock()
            defer { verrou.unlock() }
            return ids.filter { $0 == id }.count
        }
    }

    private let audioMediaId = "media-bg-1"

    private func sceneAvecFondSonore() -> StorySlide {
        let fond = StoryAudioPlayerObject(
            id: "audio-1",
            postMediaId: audioMediaId,
            placement: "background",
            x: 0.5, y: 0.5,
            volume: 0.5,
            waveformSamples: [],
            isBackground: true,
            startTime: Float(0),
            duration: Float(5),
            loop: true
        )
        var effects = StoryEffects(audioPlayerObjects: [fond])
        effects.background = "#112233"
        return StorySlide(id: "scene-son", effects: effects, duration: 5)
    }

    private func sceneMuette() -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#112233"
        return StorySlide(id: "scene-muette", effects: effects, duration: 5)
    }

    private func sceneVideoSonore() -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#112233"
        effects.mediaObjects = [StoryMediaObject(id: "clip", kind: .video, aspectRatio: 1)]
        return StorySlide(id: "scene-video", effects: effects, duration: 5)
    }

    private func canvas(_ slide: StorySlide) -> StoryCanvasUIView {
        let vue = StoryCanvasUIView(slide: slide, mode: .play)
        vue.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        vue.layoutIfNeeded()
        return vue
    }

    private func contexte(mute: Bool, verrou: Bool, demandes: Demandes) -> StoryReaderContext {
        StoryReaderContext(mute: mute,
                           postMediaURLResolver: { id in
                               demandes.note(id)
                               return nil
                           },
                           locksMute: verrou)
    }

    private func pomper(jusqua condition: () -> Bool, secondes: TimeInterval = 1.0) {
        let limite = Date(timeIntervalSinceNow: secondes)
        while !condition() && Date() < limite {
            RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.01))
        }
    }

    func test_uneSceneSansSon_neDemandeAucuneSession() {
        let vue = canvas(sceneMuette())
        vue.setReaderContext(StoryReaderContext())
        vue._forceContentReadyForTesting()

        vue.startAudioPlayback()

        XCTAssertFalse(vue.didRequestPlaybackSession,
                       "rien ne sonne : demander .playback + duckOthers baisserait la musique des autres apps")
        XCTAssertTrue(vue._readerAudioMixerForTesting.isPlaying,
                      "la passe silencieuse reste posée : seule la session est retenue")
    }

    func test_uneVideoSonore_demandeEncoreLaSession() {
        let vue = canvas(sceneVideoSonore())
        vue.setReaderContext(StoryReaderContext())
        vue._forceContentReadyForTesting()

        vue.startAudioPlayback()

        XCTAssertTrue(vue.didRequestPlaybackSession,
                      "le son d'une vidéo passe par la session du canvas : la retirer le rendrait à l'interrupteur silence")
        vue.releasePlaybackSessionIfNeeded()
    }

    func test_uneVideoSonoreMuette_neDemandePasLaSession() {
        let vue = canvas(sceneVideoSonore())
        vue.setReaderContext(StoryReaderContext(mute: true))
        vue._forceContentReadyForTesting()

        vue.startAudioPlayback()

        XCTAssertFalse(vue.didRequestPlaybackSession)
    }

    func test_uneCarteVerrouillee_neTelechargeRienEtNeDemarreRien() {
        let demandes = Demandes()
        let vue = canvas(sceneAvecFondSonore())

        vue.setReaderContext(contexte(mute: true, verrou: true, demandes: demandes))
        pomper(jusqua: { false }, secondes: 0.3)

        XCTAssertEqual(demandes.nombre(pour: audioMediaId), 0,
                       "une carte de fil ne sera jamais audible : aucune adresse audio ne se résout, rien ne se télécharge")
        XCTAssertFalse(vue.slideHasSchedulableAudio)
        XCTAssertFalse(vue.isSlideAudioPending(),
                       "la timeline d'une carte ne s'arrête pas pour un son qu'elle ne jouera pas")
        XCTAssertEqual(vue._readerAudioMixerForTesting.activeClipCount
                       + vue._readerAudioMixerForTesting.backgroundClipCount, 0)
        XCTAssertFalse(vue._readerAudioMixerForTesting.engine.isRunning)
        XCTAssertFalse(vue.didRequestPlaybackSession)
    }

    func test_unMuetLevable_prepareEncoreLeSon() {
        let demandes = Demandes()
        let vue = canvas(sceneAvecFondSonore())

        vue.setReaderContext(contexte(mute: true, verrou: false, demandes: demandes))
        pomper(jusqua: { demandes.nombre(pour: self.audioMediaId) > 0 })

        XCTAssertGreaterThan(demandes.nombre(pour: audioMediaId), 0,
                             "le viewer story relève son muet d'un doigt : le son doit être prêt")
    }

    func test_leVerrouQuiTombe_declencheLaPreparation() {
        let demandes = Demandes()
        let vue = canvas(sceneAvecFondSonore())
        vue.setReaderContext(contexte(mute: true, verrou: true, demandes: demandes))
        XCTAssertFalse(vue.slideHasSchedulableAudio)

        vue.setReaderContext(contexte(mute: false, verrou: false, demandes: demandes))

        XCTAssertTrue(vue.slideHasSchedulableAudio,
                      "au plein écran le son se prépare : sinon il ne viendrait jamais")
        pomper(jusqua: { demandes.nombre(pour: self.audioMediaId) > 0 })
        XCTAssertGreaterThan(demandes.nombre(pour: audioMediaId), 0)
    }

    func test_unMixerMuet_nePlanifieRienEtNeDemarrePasLeMoteur() throws {
        let fixture = try Self.fixtureAudio()
        let enregistreur = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: enregistreur)
        try mixer.configure(audios: [Self.piste()], urls: ["fg": fixture])
        mixer.setMute(true)

        let planifie = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#muet")

        XCTAssertFalse(planifie)
        XCTAssertTrue(enregistreur.passes.isEmpty)
        XCTAssertFalse(mixer.engine.isRunning, "un moteur muet ne réveille pas le matériel audio")
        XCTAssertFalse(mixer.hasStartedPlayback(slideKey: "k#muet"),
                       "la clé reste libre : relever le muet doit planifier, pas reprendre une passe vide")
        XCTAssertFalse(mixer.isPlaying)
    }

    func test_unMixerQuiRetrouveLeSon_planifieAuRetour() throws {
        let fixture = try Self.fixtureAudio()
        let enregistreur = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: enregistreur)
        try mixer.configure(audios: [Self.piste()], urls: ["fg": fixture])
        mixer.setMute(true)
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#retour")

        mixer.setMute(false)
        let planifie = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#retour", slideElapsed: 2)

        XCTAssertTrue(planifie)
        XCTAssertEqual(enregistreur.passes.count, 1)
        XCTAssertTrue(mixer.hasStartedPlayback(slideKey: "k#retour"))
        mixer.stop()
    }

    private static func piste() -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: "fg", postMediaId: "fg",
                               volume: 1,
                               startTime: 0, duration: 4,
                               loop: false, fadeIn: nil, fadeOut: nil)
    }

    private static func fixtureAudio() throws -> URL {
        let taux: Double = 8_000
        guard let format = AVAudioFormat(standardFormatWithSampleRate: taux, channels: 1),
              let tampon = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(taux))
        else { throw XCTSkip("AVAudioFormat indisponible sur cet hôte") }
        tampon.frameLength = AVAudioFrameCount(taux)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("activation-\(UUID().uuidString).caf")
        let fichier = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<4).forEach { _ in try fichier.write(from: tampon) }
        return url
    }
}
