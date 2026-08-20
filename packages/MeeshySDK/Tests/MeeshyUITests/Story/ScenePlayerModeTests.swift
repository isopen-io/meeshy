import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// B4 — la règle des trois modes du `MeeshyScenePlayer`, et le câblage du
/// player sur l'hôte canvas EXISTANT.
///
/// L'invariant du dépôt « le canvas naît en pause » vaut pour les TROIS modes :
/// la lecture démarre par la commande du viewer, jamais à la naissance.
@MainActor
final class ScenePlayerModeTests: XCTestCase {

    // MARK: - La règle des modes (pure)

    func test_readerConfig_isBornPaused_keepsSound_andShowsChrome() {
        let config = ScenePlayerConfig(mode: .reader)
        XCTAssertTrue(config.startsPaused)
        XCTAssertFalse(config.isMuted)
        XCTAssertTrue(config.showsChrome)
    }

    func test_previewConfig_isBornPaused_keepsSound_andHidesChrome() {
        let config = ScenePlayerConfig(mode: .preview)
        XCTAssertTrue(config.startsPaused)
        XCTAssertFalse(config.isMuted)
        XCTAssertFalse(config.showsChrome)
    }

    func test_cardConfig_isBornPaused_mutedAndLooping() {
        let config = ScenePlayerConfig(mode: .card)
        XCTAssertTrue(config.startsPaused)
        XCTAssertTrue(config.isMuted)
        XCTAssertTrue(config.loops)
        XCTAssertFalse(config.showsChrome)
    }

    func test_everyMode_isBornPaused() {
        for mode: ScenePlayerMode in [.reader, .preview, .card] {
            XCTAssertTrue(ScenePlayerConfig(mode: mode).startsPaused, "\(mode)")
        }
    }

    func test_loopIsTheCardRule_alone() {
        XCTAssertFalse(ScenePlayerConfig(mode: .reader).loops)
        XCTAssertFalse(ScenePlayerConfig(mode: .preview).loops)
    }

    // MARK: - Le player monte l'hôte existant, nourri par le pont v3

    func test_player_mountsTheExistingReaderHost_fedByTheBridge() {
        let player = Self.player(document: Self.textDocument(), mode: .reader)
        XCTAssertEqual(player.host.storyItem.storyEffects?.textObjects.first?.text, "Hello")
    }

    func test_hostPause_followsTheIsPlayingCommand() {
        let paused = Self.player(document: Self.textDocument(), mode: .reader, isPlaying: false)
        XCTAssertTrue(paused.host.isPaused)

        let playing = Self.player(document: Self.textDocument(), mode: .reader, isPlaying: true)
        XCTAssertFalse(playing.host.isPaused)
    }

    func test_cardMode_mountsTheHostMuted_readerKeepsItsSound() {
        XCTAssertTrue(Self.player(document: Self.textDocument(), mode: .card).host.mute)
        XCTAssertFalse(Self.player(document: Self.textDocument(), mode: .reader).host.mute)
    }

    func test_sceneIndex_selectsTheRenderedScene() {
        let document = CanvasV3(scenes: [
            Self.textScene(id: "s1", text: "Hello"),
            Self.textScene(id: "s2", text: "Salut"),
        ])
        let second = Self.player(document: document, mode: .reader, sceneIndex: 1)
        XCTAssertEqual(second.host.storyItem.storyEffects?.textObjects.first?.text, "Salut")
    }

    // MARK: - C6 : le Prisme du LECTEUR, jamais `translations.first`

    func test_readerPrism_reachesTheHost() {
        let player = Self.player(document: Self.textDocument(), mode: .reader)
            .preferredContentLanguages(["fr", "en"])
        XCTAssertEqual(player.host.preferredLanguages, ["fr", "en"])
    }

    func test_prism_resolvesTheReaderLanguage_notTheFirstTranslation() {
        let player = Self.player(document: Self.textDocument(), mode: .reader)
            .preferredContentLanguages(["fr", "en"])
        let text = player.host.storyItem.storyEffects?.textObjects.first
        XCTAssertEqual(text?.resolvedText(preferredLanguages: player.host.preferredLanguages),
                       "Bonjour")
    }

    func test_prism_fallsBackToTheOriginal_whenNoLanguageMatches() {
        let player = Self.player(document: Self.textDocument(), mode: .reader)
            .preferredContentLanguages(["de"])
        let text = player.host.storyItem.storyEffects?.textObjects.first
        XCTAssertEqual(text?.resolvedText(preferredLanguages: player.host.preferredLanguages),
                       "Hello")
    }

    // MARK: - O16 : la clé de continuité est l'identité du média porteur

    func test_carrierMediaIdentity_isThePorterIdentity() {
        XCTAssertEqual(
            MeeshyScenePlayer.carrierMediaIdentity(in: Self.carrierDocument(), sceneIndex: 0),
            "64b0000000000000000000aa")
    }

    func test_carrierMediaIdentity_isNil_withoutAPorter() {
        XCTAssertNil(MeeshyScenePlayer.carrierMediaIdentity(in: Self.textDocument(), sceneIndex: 0))
    }

    // MARK: - Fixtures

    private static func player(document: CanvasV3,
                               mode: ScenePlayerMode,
                               sceneIndex: Int = 0,
                               isPlaying: Bool = false) -> MeeshyScenePlayer {
        MeeshyScenePlayer(document: document,
                          mode: mode,
                          sceneIndex: .constant(sceneIndex),
                          isPlaying: .constant(isPlaying),
                          accentColorHex: "#7C3AED")
    }

    private static func textScene(id: String, text: String) -> SceneV3 {
        SceneV3(id: id, objects: [
            ObjectV3(id: "t1", kind: .text,
                     anchor: .free(x: 0.5, y: 0.5), plane: .fg, z: 1,
                     transform: TransformV3(), locale: "en",
                     payload: ["text": .string(text),
                               "translations": .object(["fr": .string("Bonjour"),
                                                        "es": .string("Hola")])]),
        ])
    }

    private static func textDocument() -> CanvasV3 {
        CanvasV3(scenes: [textScene(id: "s1", text: "Hello")])
    }

    private static func carrierDocument() -> CanvasV3 {
        CanvasV3(scenes: [SceneV3(id: "s1", objects: [
            ObjectV3(id: "bg", kind: .media,
                     anchor: .free(x: 0.5, y: 0.5), plane: .bg, z: 0,
                     transform: TransformV3(),
                     payload: ["background": .string("#000000")]),
            ObjectV3(id: "m1", kind: .media,
                     anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 1,
                     transform: TransformV3(),
                     payload: ["postMediaId": .string("64b0000000000000000000aa"),
                               "mediaType": .string("video")]),
        ])])
    }
}

/// Garde de source B4 — le player ENVELOPPE le moteur existant, il ne le
/// réécrit pas, et il ne creuse pas la profondeur de type qui fait déborder
/// la pile sur device (1008 Ko contre 8 Mo au simulateur).
final class ScenePlayerSourceGuardTests: XCTestCase {

    func test_body_mountsTheExistingReaderHost() throws {
        let code = try Self.strippedSources()
        XCTAssertTrue(code.contains("StoryReaderRepresentable"),
                      "Le body doit monter l'hôte canvas existant, jamais un rendu réécrit.")
    }

    func test_noAvailabilityCascade_inTheScenePlayer() throws {
        let offenders = try Self.strippedLines().filter { $0.contains("#available") }
        XCTAssertTrue(offenders.isEmpty, "Cascade d'availability interdite : \(offenders)")
    }

    func test_noNestedGenericViewBuilder_inTheScenePlayer() throws {
        let offenders = try Self.strippedLines().filter(Self.isGenericViewFactory)
        XCTAssertTrue(offenders.isEmpty, "Fabrique de vue générique interdite : \(offenders)")
    }

    func test_noPrivateAVPlayer_inTheScenePlayer() throws {
        let offenders = try Self.strippedLines().filter { $0.contains("AVPlayer(") }
        XCTAssertTrue(offenders.isEmpty,
                      "O16 : le média porteur passe par SharedAVPlayerManager, jamais par un "
                      + "player privé : \(offenders)")
    }

    func test_noFirstTranslationFallback_inTheScenePlayer() throws {
        let offenders = try Self.strippedLines().filter { $0.contains("translations.first") }
        XCTAssertTrue(offenders.isEmpty,
                      "C6 : la résolution suit l'ordre du Prisme du lecteur : \(offenders)")
    }

    func test_guardDetectsAGenericViewFactory() {
        let sample = "    @ViewBuilder private func wrap<Content: View>(_ c: Content) -> some View {"
        XCTAssertTrue(Self.isGenericViewFactory(sample))
    }

    func test_guardAcceptsAPlainBody() {
        XCTAssertFalse(Self.isGenericViewFactory("    public var body: some View {"))
    }

    // MARK: - Helpers

    private static func isGenericViewFactory(_ line: String) -> Bool {
        line.contains("func ") && line.contains("<") && line.contains(": View>")
    }

    private static func strippedLines() throws -> [String] {
        try strippedSources()
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
    }

    /// Le fichier vit dans `Tests/MeeshyUITests/Story/` : quatre remontées
    /// avant de redescendre dans `Sources`.
    private static func strippedSources() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/ScenePlayer")
        let files = try FileManager.default
            .contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(files.isEmpty, "Aucune source ScenePlayer trouvée : \(root.path)")
        return try files
            .map { try strippingLineComments(String(contentsOf: $0, encoding: .utf8)) }
            .joined(separator: "\n")
    }

    private static func strippingLineComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }
}
