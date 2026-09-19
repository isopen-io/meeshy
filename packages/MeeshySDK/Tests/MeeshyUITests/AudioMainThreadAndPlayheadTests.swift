import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// **L'audio cesse de tenir le fil principal, et de battre à 30 Hz** (#7010).
///
/// Deux défauts distincts, un même symptôme — des images perdues pendant que
/// quelque chose joue :
/// 1. `AudioPlaybackManager.playLocal` lisait les octets du fichier sur le
///    MainActor, parce que `Task { }` HÉRITE de l'acteur de son englobant ;
/// 2. deux surfaces de story s'abonnaient au playhead, qui publie ≈ 30 fois
///    par seconde, pour des rendus qui ne changent qu'à la SECONDE ou aux
///    FRONTIÈRES de fenêtre.
@MainActor
final class AudioMainThreadAndPlayheadTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Les octets partent du fil principal

    func test_audioBytesLoader_readsAFileItIsGiven() async throws {
        let payload = Data("meeshy".utf8)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("audio-bytes-\(UUID().uuidString).bin")
        try payload.write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }

        let bytes = await AudioBytesLoader.bytes(at: url)

        XCTAssertEqual(bytes, payload)
    }

    /// Un fichier absent DÉGRADE en `nil` : l'appelant journalise et retombe,
    /// il n'a jamais rien fait de la valeur de l'erreur.
    func test_audioBytesLoader_missingFile_returnsNil() async {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("absent-\(UUID().uuidString).bin")

        let bytes = await AudioBytesLoader.bytes(at: url)

        XCTAssertNil(bytes)
    }

    /// **`Task { }` n'est pas un saut de fil.** C'est la confusion qui a
    /// produit le défaut : la forme ressemble à du travail d'arrière-plan, et
    /// rien ne signale que l'acteur suit. Seul `Task.detached` part vraiment —
    /// et la garde le tient par la SOURCE, faute d'un fil observable depuis un
    /// témoin.
    func test_playLocal_readsItsBytesOffTheMainActor() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/AudioPlayerView.swift")

        XCTAssertFalse(
            source.contains("let data = try Data(contentsOf: url)"),
            "`playLocal` ne doit plus lire le fichier depuis une `Task { }` héritée du MainActor (#7010)."
        )
        XCTAssertTrue(
            source.contains("AudioBytesLoader.bytes(at: url)"),
            "`playLocal` doit passer par `AudioBytesLoader`, qui détache vraiment (#7010)."
        )
        let loader = try sdkSource("Sources/MeeshyUI/Media/AudioBytesLoader.swift")
        XCTAssertTrue(
            loader.contains("Task.detached"),
            "`AudioBytesLoader` doit détacher : `Task { }` hériterait de l'appelant, qui est `@MainActor` (#7010)."
        )
    }

    // MARK: - Le playhead n'est plus OBSERVÉ par ce qui ne bat pas avec lui

    /// Le compteur « M:SS » change une fois par SECONDE et porte déjà sa
    /// cadence (`TimelineView(.periodic(by: 1))`). L'abonnement ré-évaluait son
    /// corps — donc reconstruisait la `TimelineView` — vingt-neuf fois de trop
    /// par seconde.
    func test_remainingTimeCounter_readsThePlayheadWithoutObservingIt() throws {
        let source = try sdkSource("Sources/MeeshyUI/Story/Controls/AudioChipDisplay.swift")

        XCTAssertFalse(
            source.contains("@ObservedObject private var playhead"),
            "`AudioChipRemainingTimeText` ne doit pas s'abonner au playhead : sa cadence vient du `TimelineView` (#7010)."
        )
        XCTAssertTrue(
            source.contains("private var playhead: StoryReaderPlayheadState { .shared }"),
            "Le compteur doit LIRE le playhead dans la fermeture du `TimelineView` — valeur fraîche, zéro abonnement (#7010)."
        )
    }

    /// L'overlay des chips ne change qu'aux FRONTIÈRES de fenêtre — quelques
    /// fois par slide. Observé, il reconstruisait `GeometryReader`, `ForEach`
    /// et chaque chip (onde animée comprise) trente fois par seconde pour un
    /// rendu identique.
    func test_readerOverlay_reactsToWindowMembershipNotToTheClock() throws {
        let source = try sdkSource("Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift")

        XCTAssertFalse(
            source.contains("@ObservedObject private var playhead"),
            "`AudioForegroundReaderOverlay` ne doit pas s'abonner au playhead (#7010)."
        )
        XCTAssertTrue(
            source.contains("@State private var visibleAudioIds"),
            "L'overlay doit porter l'APPARTENANCE, pas le temps (#7010)."
        )
        XCTAssertTrue(
            source.contains("guard ids != visibleAudioIds else { return }"),
            "L'écriture doit être FILTRÉE : sans ce garde, l'`onReceive` réécrirait l'état trente fois par seconde et le corps se ré-évaluerait comme avant (#7010)."
        )
    }

    /// Le filtre pur qui décide de l'appartenance n'a PAS changé : c'est ce qui
    /// permet de déplacer l'abonnement sans déplacer le comportement.
    func test_windowMembership_stillOpensAndClosesOnItsBounds() {
        let audio = StoryAudioPlayerObject(
            id: "a",
            postMediaId: "media-a",
            placement: "overlay",
            x: 0.5, y: 0.8,
            volume: 1.0,
            waveformSamples: [],
            isBackground: false,
            startTime: 3.0,
            duration: 4.0
        )

        XCTAssertTrue(AudioForegroundReaderOverlay
            .visibleAudios(in: [audio], elapsed: 3.0, slideDuration: 10).map(\.id) == ["a"])
        XCTAssertTrue(AudioForegroundReaderOverlay
            .visibleAudios(in: [audio], elapsed: 7.0, slideDuration: 10).map(\.id) == ["a"])
        XCTAssertTrue(AudioForegroundReaderOverlay
            .visibleAudios(in: [audio], elapsed: 2.9, slideDuration: 10).isEmpty)
        XCTAssertTrue(AudioForegroundReaderOverlay
            .visibleAudios(in: [audio], elapsed: 7.1, slideDuration: 10).isEmpty)
    }
}
