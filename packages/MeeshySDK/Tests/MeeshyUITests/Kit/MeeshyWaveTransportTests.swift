import Testing
import Foundation
@testable import MeeshyUI

/// K35 hors du son (profil, planche Carte-Sang) : la variante `transport` relit un
/// trajet — disque lecture / pause, piste à repères, heure courante, capsule de
/// verre — et la variante `indicator` est l'onde seule. Mesures lues dans les
/// vecteurs K35 partagés.
@Suite("MeeshyWavePlayer — transport et indicateur")
struct MeeshyWaveTransportTests {
    private static let file = "K35-MeeshyWavePlayer.vectors.json"

    @Test("les deux variantes du profil existent, nommées comme les vecteurs")
    func variants_followTheVectors() throws {
        let names = try #require(try KitEvolutionVectors.json(Self.file)["variantes"] as? [String])
        #expect(MeeshyWavePlayerVariant.allCases.map(\.rawValue) == names)
    }

    @Test("la capsule du transport : disque 44, écart 14, marges 10 / 16 / 10, repère 3 × 10, hauteur 64")
    func transport_measures() throws {
        let row = try KitEvolutionVectors.object(Self.file, "transport")
        #expect(MeeshyWaveTransportRecipe.buttonSize == row["bouton"] as? Double)
        #expect(MeeshyWaveTransportRecipe.gap == row["ecart"] as? Double)
        #expect(MeeshyWaveTransportRecipe.leadingInset == row["debut"] as? Double)
        #expect(MeeshyWaveTransportRecipe.trailingInset == row["fin"] as? Double)
        #expect(MeeshyWaveTransportRecipe.verticalInset == row["vertical"] as? Double)
        #expect(MeeshyWaveTransportRecipe.markerWidth == row["repereLargeur"] as? Double)
        #expect(MeeshyWaveTransportRecipe.markerHeight == row["repereHauteur"] as? Double)
        #expect(MeeshyWaveTransportRecipe.height == row["hauteur"] as? Double)
        #expect(MeeshyWaveTransportRecipe.glyph(isPlaying: true) == row["glypheLecture"] as? String)
        #expect(MeeshyWaveTransportRecipe.glyph(isPlaying: false) == row["glypheRepos"] as? String)
    }

    @Test("les repères posés : bornés, triés, sans doublon ni non-nombre")
    func transport_markers_areSanitized() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "transportReperes") {
            let input = try #require(row["entree"] as? [Double])
            let expected = try #require(row["reperes"] as? [Double])
            #expect(MeeshyWaveTransportRecipe.markers(input) == expected, "\(row)")
        }
        #expect(MeeshyWaveTransportRecipe.markers([.nan, .infinity, 0.5]) == [0.5])
    }

    @Test("un repère suit la course du pouce, reflétée en arabe")
    func transport_markerCenter_followsTheThumbCourse() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "transportCentres") {
            let center = MeeshyWaveTransportRecipe.markerCenter(
                fraction: try #require(row["fraction"] as? Double),
                width: try #require(row["largeur"] as? Double),
                inset: try #require(row["marge"] as? Double),
                isRightToLeft: try #require(row["rtl"] as? Bool)
            )
            #expect(center == row["centre"] as? Double, "\(row)")
        }
    }

    @Test("le disque se nomme par ce qu'il fera")
    func transport_toggleLabel_saysTheNextGesture() {
        #expect(MeeshyWaveTransportRecipe.toggleLabel(isPlaying: false, play: "Rejouer", pause: "Pause") == "Rejouer")
        #expect(MeeshyWaveTransportRecipe.toggleLabel(isPlaying: true, play: "Rejouer", pause: "Pause") == "Pause")
    }

    @Test("l'indicateur : cinq barres de 16 par défaut, borné de 3 à 24, une barre par pas de 6")
    func indicator_measures() throws {
        let row = try KitEvolutionVectors.object(Self.file, "indicateur")
        #expect(MeeshyWaveIndicatorRecipe.defaultBars == row["barres"] as? Int)
        #expect(MeeshyWaveIndicatorRecipe.height == row["hauteur"] as? Double)
        #expect(MeeshyWaveIndicatorRecipe.minimumBars == row["min"] as? Int)
        #expect(MeeshyWaveIndicatorRecipe.maximumBars == row["max"] as? Int)
        #expect(MeeshyWaveIndicatorRecipe.width(bars: 5) == row["largeurCinq"] as? Double)
        for bound in try KitEvolutionVectors.rows(Self.file, "indicateurBornes") {
            let requested = try #require(bound["demande"] as? Int)
            #expect(MeeshyWaveIndicatorRecipe.bars(requested) == bound["barres"] as? Int, "\(bound)")
        }
    }

    @Test("l'égaliseur sans niveaux : une crête au milieu, symétrique, jamais à zéro")
    func indicator_equalizer_isASymmetricCrest() {
        let levels = MeeshyWaveIndicatorRecipe.equalizerLevels(bars: 5)
        #expect(levels.count == 5)
        #expect(levels == levels.reversed())
        #expect(levels[2] == 1)
        #expect(levels.allSatisfy { $0 >= 0.5 })
    }

    @Test("le transport est fait du kit : K02, K05 et le verre de K01 ; aucune couleur en dur, aucun minuteur")
    func source_transportIsMadeOfTheKit() throws {
        let code = try KitEvolutionVectors.code("MeeshyWaveTransport.swift")
        #expect(code.contains("MeeshyGlassButton("))
        #expect(code.contains("MeeshySliderTrack("))
        #expect(code.contains(".meeshyGlass(in: Capsule()"))
        #expect(code.contains("MeeshyWaveBars("))
        for word in ["Color(", "Color.", "Timer", "AVPlayer", "Slider(", "TimelineView"] {
            #expect(!code.contains(word), "MeeshyWaveTransport.swift contient \(word)")
        }
    }
}
