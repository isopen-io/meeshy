import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Exploration de langue en cours de lecture (strip « Traductions » du viewer).
///
/// Choisir une langue ne change NI l'id du slide NI le `content` du post — les
/// deux seules conditions qui déclenchaient jusqu'ici la repropagation dans
/// `StoryReaderRepresentable.updateUIView`. Le canvas continuait donc d'afficher
/// les textes dans l'ancienne langue pendant que le strip, lui, marquait bien la
/// nouvelle comme active (bug 2026-07-25).
@MainActor
final class ReaderLanguageSwitchTests: XCTestCase {

    // MARK: - Copie du contexte

    func test_withPreferredLanguages_replacesChain() {
        let context = StoryReaderContext(preferredLanguages: ["en"], mute: true)
        let switched = context.withPreferredLanguages(["es", "fr"])

        XCTAssertEqual(switched.preferredLanguages, ["es", "fr"])
    }

    /// Les resolvers média sont posés à la construction du canvas et ne doivent
    /// jamais être perdus par une bascule de langue — sinon le fond et les clips
    /// disparaissent en changeant de drapeau.
    func test_withPreferredLanguages_keepsEveryOtherSetting() {
        let resolver: @Sendable (String) -> URL? = { _ in URL(string: "https://example.com/a.mp4") }
        let audioResolver: @Sendable (String) -> URL? = { _ in URL(string: "file:///tmp/a.m4a") }
        let context = StoryReaderContext(preferredLanguages: ["en"],
                                         mute: true,
                                         postMediaURLResolver: resolver,
                                         localAudioURLResolver: audioResolver)

        let switched = context.withPreferredLanguages(["de"])

        XCTAssertTrue(switched.mute)
        XCTAssertEqual(switched.postMediaURLResolver?("x")?.absoluteString,
                       "https://example.com/a.mp4")
        XCTAssertEqual(switched.localAudioURLResolver?("x")?.absoluteString,
                       "file:///tmp/a.m4a")
    }

    func test_withPreferredLanguages_emptyChain_isAllowed() {
        let context = StoryReaderContext(preferredLanguages: ["fr"])
        XCTAssertEqual(context.withPreferredLanguages([]).preferredLanguages, [])
    }

    // MARK: - Gardes de source

    private func source(_ relativePath: String) throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Canvas
                .deletingLastPathComponent()   // Story
                .deletingLastPathComponent()   // MeeshyUITests
                .deletingLastPathComponent()   // Tests
                .deletingLastPathComponent()   // MeeshySDK
                .appendingPathComponent(relativePath),
            encoding: .utf8
        )
    }

    /// Sans ce test, retirer la condition ferait silencieusement replonger le
    /// viewer dans le bug : le strip marquerait la langue choisie et le texte
    /// resterait dans l'ancienne.
    func test_updateUIView_repropagatesOnLanguageChange() throws {
        let code = try source("Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift")

        XCTAssertTrue(
            code.contains("view.readerContext.preferredLanguages != preferredLanguages"),
            "updateUIView doit détecter le changement de chaine de langues")
        XCTAssertTrue(
            code.contains("view.setPreferredLanguages(preferredLanguages)"),
            "updateUIView doit propager la nouvelle chaine au canvas")
    }

    /// Une bascule de langue doit reconstruire les layers : le cache est indexé
    /// sur une signature qui inclut la langue.
    func test_setPreferredLanguages_rebuildsLayers() throws {
        let code = try source("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Core.swift")
        guard let range = code.range(of: "func setPreferredLanguages(") else {
            return XCTFail("setPreferredLanguages absent de StoryCanvasUIView+Core")
        }
        let body = String(code[range.lowerBound...].prefix(700))

        XCTAssertTrue(body.contains("rebuildLayers()"),
                      "la bascule de langue doit reconstruire les layers")
        XCTAssertTrue(body.contains("reconfigureAudioForPlayback()"),
                      "la bascule de langue doit re-scheduler l'audio (variantes TTS)")
    }

    /// Le canvas naît en `.play` et `setReaderContext` lance immédiatement
    /// l'audio. L'hôte, lui, pose souvent son gel APRÈS coup (l'interstitiel
    /// d'identité est armé dans `onAppear`/`onChange`, donc après l'évaluation
    /// du body qui a créé le canvas). Naître en pause supprime la course : sans
    /// cela on entend la story PENDANT l'interlude.
    func test_makeUIView_startsPausedBeforeInjectingContext() throws {
        let code = try source("Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift")
        guard let pause = code.range(of: "view.setPaused(true)"),
              let context = code.range(of: "view.setReaderContext(StoryReaderContext(") else {
            return XCTFail("makeUIView ne pose plus la pause ou n'injecte plus le contexte")
        }
        XCTAssertLessThan(pause.lowerBound, context.lowerBound,
                          "la pause doit être posée AVANT l'injection du contexte, qui démarre l'audio")
    }

    /// C'est `updateUIView` qui rend la lecture — sinon le canvas resterait figé.
    func test_updateUIView_releasesThePause() throws {
        let code = try source("Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift")
        XCTAssertTrue(code.contains("view.setPaused(isPaused || isOutgoing)"),
                      "updateUIView doit refléter l'état de pause de l'hôte")
    }

    /// Le corps d'une fonction, commentaires retirés — sinon une garde qui
    /// interdit un motif se déclenche sur le commentaire qui l'explique.
    private func codeOfFunction(_ signature: String, in file: String, limit: Int = 900) throws -> String {
        let code = try source(file)
        guard let range = code.range(of: signature) else {
            throw XCTSkip("\(signature) introuvable dans \(file)")
        }
        // Filtrage AVANT troncature : les commentaires de ce projet sont
        // denses, les tronquer d'abord ferait sortir la ligne cible de la
        // fenêtre.
        let stripped = String(code[range.lowerBound...])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        return String(stripped.prefix(limit))
    }

    /// TROIS chemins démarrent la lecture, et tous doivent respecter la pause.
    /// Naître en pause ne suffit pas : le « GO » de fin de chargement et la
    /// (ré)installation du displayLink sont asynchrones et retombaient PENDANT
    /// l'interlude, faisant jouer la story sous le gel (bug user 2026-07-25,
    /// signalé deux fois).
    func test_contentReadyGo_isGatedOnPause() throws {
        let body = try codeOfFunction("if pendingBackgroundActivation",
                                      in: "Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+ContentReadiness.swift",
                                      limit: 120)
        XCTAssertTrue(body.contains("!isPlaybackPaused"),
                      "le GO de fin de chargement ne doit pas se consommer sous pause")
    }

    func test_startPlayback_isGatedOnPause() throws {
        let body = try codeOfFunction("if contentReadyFired",
                                      in: "Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Playback.swift",
                                      limit: 120)
        XCTAssertTrue(body.contains("!isPlaybackPaused"),
                      "startPlayback ne doit pas relancer les médias sous pause")
    }

    /// Contrepartie indispensable : ce qui n'a pas été consommé sous gel doit
    /// l'être à la reprise, sinon une story chargée derrière l'interlude ne
    /// démarrerait jamais son fond.
    func test_resume_consumesPendingActivation() throws {
        let body = try codeOfFunction("func setStoryPlaybackPaused(",
                                      in: "Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Playback.swift",
                                      limit: 1600)
        XCTAssertTrue(body.contains("pendingBackgroundActivation = false"),
                      "la reprise doit solder l'activation restée armée")
    }

    // MARK: - Synchronisation des points de lecture

    /// QUATRIÈME chemin de reprise : le retour d'arrière-plan. Il relançait les
    /// médias sans consulter la pause — quitter l'app sur une story en pause
    /// (long-press, interlude, commentaires) puis y revenir la faisait repartir
    /// sous une slide gelée.
    func test_willEnterForeground_respectsPause() throws {
        let body = try codeOfFunction("func handleWillEnterForeground() {",
                                      in: "Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Lifecycle.swift",
                                      limit: 700)
        XCTAssertTrue(body.contains("guard !isPlaybackPaused else { return }"),
                      "le retour d'arrière-plan doit respecter la pause en cours")
    }

    /// Le playhead est l'unique source de vérité du temps de la slide. Toute
    /// reprise doit y RECALER les players avant de les relancer, sinon fond,
    /// vidéos foreground et audio repartent chacun de leur position propre —
    /// c'est là que naissent les décalages son/image.
    func test_willEnterForeground_realignsBeforeResuming() throws {
        let body = try codeOfFunction("func handleWillEnterForeground() {",
                                      in: "Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Lifecycle.swift",
                                      limit: 700)
        guard let align = body.range(of: "pushSlidePlayheadToLayers()"),
              let resume = body.range(of: "backgroundLayer.handleAppLifecycle(active: true)") else {
            return XCTFail("le retour d'arrière-plan ne recale plus le playhead")
        }
        XCTAssertLessThan(align.lowerBound, resume.lowerBound,
                          "le recalage doit précéder la relance des players")
    }

    /// Même exigence pour la reprise de pause : recaler puis relancer.
    func test_resume_realignsBeforeResuming() throws {
        let body = try codeOfFunction("func setStoryPlaybackPaused(",
                                      in: "Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Playback.swift",
                                      limit: 1600)
        guard let align = body.range(of: "pushSlidePlayheadToLayers()"),
              let resume = body.range(of: "backgroundLayer.isPlaybackActive = true") else {
            return XCTFail("la reprise ne recale plus le playhead")
        }
        XCTAssertLessThan(align.lowerBound, resume.lowerBound,
                          "le recalage doit précéder la relance des players")
    }
}
