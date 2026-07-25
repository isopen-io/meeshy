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
    /// l'audio. Si la pause n'est posée qu'au premier `updateUIView`, une story
    /// créée sous un gel (interlude, commentaires, appel) se fait entendre
    /// d'abord — c'est le « on entend la story suivante pendant l'interlude ».
    func test_makeUIView_appliesPauseBeforeStartingAudio() throws {
        let code = try source("Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift")
        guard let pause = code.range(of: "view.setPaused(isPaused || isOutgoing)"),
              let context = code.range(of: "view.setReaderContext(StoryReaderContext(") else {
            return XCTFail("makeUIView ne pose plus la pause ou n'injecte plus le contexte")
        }
        XCTAssertLessThan(pause.lowerBound, context.lowerBound,
                          "la pause doit être posée AVANT l'injection du contexte, qui démarre l'audio")
    }
}
