import XCTest
@testable import Meeshy

/// Tête de photothèque affichée sous le carrousel de pièces jointes : combien
/// de vignettes, dans quel ordre, et avec quel son à l'aperçu.
final class RecentMediaStripHeadTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Components
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
        return try strippingComments(
            String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    /// Les commentaires de ce fichier décrivent la règle et citent forcément les
    /// motifs inspectés : les lire reviendrait à tester de la prose.
    private func strippingComments(_ source: String) -> String {
        var out = ""
        var inBlock = false
        for rawLine in source.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = String(rawLine)
            if inBlock {
                guard let end = line.range(of: "*/") else { continue }
                line = String(line[end.upperBound...])
                inBlock = false
            }
            while let start = line.range(of: "/*") {
                if let end = line.range(of: "*/", range: start.upperBound..<line.endIndex) {
                    line = String(line[..<start.lowerBound]) + String(line[end.upperBound...])
                } else {
                    line = String(line[..<start.lowerBound])
                    inBlock = true
                }
            }
            if let comment = line.range(of: "//") {
                line = String(line[..<comment.lowerBound])
            }
            out += line + "\n"
        }
        return out
    }

    private func stripSource() throws -> String {
        try source("Meeshy/Features/Main/Components/RecentMediaStrip.swift")
    }

    // MARK: - Taille de l'échantillon

    /// 19 vignettes + la tuile photothèque = 20 cellules : deux rangées pleines
    /// de dix sur iPhone, cinq rangées de quatre sur iPad. Un compte qui ne
    /// remplit pas ses rangées laisse un trou en fin de bande.
    func test_headSampleCount_fillsWholeRowsOnBothLayouts() {
        let cells = RecentMediaStrip.headSampleCount + 1
        XCTAssertEqual(RecentMediaStrip.headSampleCount, 19)
        XCTAssertEqual(cells % 2, 0, "iPhone rend deux rangées : le total doit être pair")
        XCTAssertEqual(cells % 4, 0, "iPad rend quatre colonnes : le total doit être multiple de 4")
    }

    /// L'échantillon ne peut pas dépasser ce que le modèle va chercher, sinon la
    /// bande afficherait moins que ce qu'elle annonce sans que rien ne le dise.
    func test_headSampleCount_staysWithinTheModelFetchLimit() throws {
        let src = try stripSource()
        XCTAssertTrue(
            src.contains("func load(limit: Int = 40)"),
            "Le plafond de fetch a bougé : revérifier qu'il couvre headSampleCount"
        )
        XCTAssertLessThanOrEqual(RecentMediaStrip.headSampleCount, 40)
    }

    // MARK: - Position de la tuile photothèque

    /// La sortie vers la photothèque complète doit être atteignable dès la
    /// première cellule. En fin de bande, il fallait faire défiler 19 vignettes
    /// pour la trouver — le raccourci le plus utile était le plus caché.
    func test_openLibraryTile_isRenderedBeforeTheSamples() throws {
        let src = try stripSource()
        // Les deux dispositions se suivent dans le fichier (grille iPad puis
        // bande iPhone) : la trace attendue est donc tuile, échantillon, tuile,
        // échantillon. Toute inversion casse l'alternance.
        var trace: [String] = []
        var cursor = src.startIndex
        while cursor < src.endIndex {
            let tile = src.range(of: "openLibraryTile(c)", range: cursor..<src.endIndex)
            let samples = src.range(of: "ForEach(samples", range: cursor..<src.endIndex)
            switch (tile, samples) {
            case let (tile?, samples?) where tile.lowerBound < samples.lowerBound:
                trace.append("tile"); cursor = tile.upperBound
            case (_, let samples?):
                trace.append("samples"); cursor = samples.upperBound
            case (let tile?, nil):
                trace.append("tile"); cursor = tile.upperBound
            case (nil, nil):
                cursor = src.endIndex
            }
        }
        XCTAssertEqual(
            trace, ["tile", "samples", "tile", "samples"],
            "Chaque disposition doit rendre la tuile photothèque AVANT ses vignettes"
        )
    }

    // MARK: - Son de l'aperçu

    /// L'aperçu long-press d'une vidéo doit sonner. `isMuted = false` ne suffit
    /// pas : sans catégorie `.playback` posée, la session par défaut
    /// (`.soloAmbient`) rend l'aperçu muet dès que l'interrupteur Silence est
    /// enclenché — ce qui était le symptôme rapporté.
    func test_videoPreview_armsThePlaybackSessionAndIsNotMuted() throws {
        let src = try stripSource()
        XCTAssertFalse(
            src.contains("isMuted = true"),
            "L'aperçu vidéo ne doit plus être coupé"
        )
        XCTAssertTrue(
            src.contains("MediaSessionCoordinator.shared.activatePlaybackSync"),
            "Sans session .playback l'aperçu reste muet interrupteur Silence enclenché"
        )
    }

    /// La session passe par la source UNIQUE call-aware du SDK : la poser en
    /// direct la reconfigurerait pendant un appel VoIP et couperait le micro.
    func test_videoPreview_neverTouchesTheSharedSessionDirectly() throws {
        let src = try stripSource()
        XCTAssertFalse(
            src.contains("AVAudioSession.sharedInstance()"),
            "La session doit passer par MediaSessionCoordinator, jamais en direct"
        )
    }

    /// Un aperçu qui sonne par-dessus une note vocale en cours donnerait deux
    /// sources audibles. Les autres lecteurs se taisent AVANT l'armement :
    /// `stopAll()` passe par `SharedAVPlayerManager.stop()`, qui désactive la
    /// session — l'ordre inverse la désarmerait juste après l'avoir posée.
    func test_videoPreview_silencesOtherPlayersBeforeArmingTheSession() throws {
        let src = try stripSource()
        let stop = try XCTUnwrap(src.range(of: "PlaybackCoordinator.shared.stopAll()"))
        let arm = try XCTUnwrap(src.range(of: "MediaSessionCoordinator.shared.activatePlaybackSync"))
        XCTAssertTrue(stop.lowerBound < arm.lowerBound)
    }

    /// La session est rendue quand l'aperçu disparaît, sinon le ducking imposé
    /// aux autres apps survivrait à la fermeture du menu contextuel.
    func test_videoPreview_releasesTheSessionOnDisappear() throws {
        let src = try stripSource()
        XCTAssertTrue(src.contains("MediaSessionCoordinator.shared.deactivatePlaybackSync()"))
    }
}
