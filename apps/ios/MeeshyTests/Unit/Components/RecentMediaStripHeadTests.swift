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

    /// L'échantillon affiché est TOUT ce que le modèle va chercher (#8869) :
    /// 40 médias. Le plafond de 19 masquait 21 médias déjà chargés, et la bande
    /// horizontale de deux rangées n'en laissait voir que 7 sans défiler.
    func test_headSampleCount_showsEveryFetchedMedia() throws {
        XCTAssertEqual(RecentMediaStrip.headSampleCount, 40)
        let src = try stripSource()
        XCTAssertTrue(
            src.contains("func load(limit: Int = RecentMediaStrip.headSampleCount)"),
            "Le fetch doit chercher exactement ce que la grille affiche"
        )
    }

    /// iPhone comme iPad : une grille VERTICALE défilante qui remplit l'espace
    /// sous la rangée des types. La bande horizontale de hauteur figée à deux
    /// rangées laissait un vide au-dessus et au-dessous d'elle (#8869).
    func test_recentMedia_isAVerticalGridOnEveryIdiom() throws {
        let src = try stripSource()
        XCTAssertFalse(src.contains("ScrollView(.horizontal"), "Plus de bande horizontale")
        XCTAssertFalse(src.contains("LazyHGrid"), "Plus de grille à rangées figées")
        XCTAssertTrue(src.contains("ScrollView(.vertical"))
        XCTAssertTrue(src.contains("LazyVGrid"))
    }

    // MARK: - Position de la tuile photothèque

    /// La sortie vers la photothèque complète doit être atteignable dès la
    /// première cellule. En fin de bande, il fallait faire défiler 19 vignettes
    /// pour la trouver — le raccourci le plus utile était le plus caché.
    func test_openLibraryTile_isRenderedBeforeTheSamples() throws {
        let src = try stripSource()
        // Une seule disposition (grille verticale, #8869) : la trace attendue
        // est tuile puis échantillon. Toute inversion la casse.
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
            trace, ["tile", "samples"],
            "La grille doit rendre la tuile photothèque AVANT ses vignettes"
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
