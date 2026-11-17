import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K35 — le lecteur d'onde lu comme des VALEURS : la recette par taille, le glyphe
/// par état, la loi des barres (une barre tous les 6 px au plus, jamais sous 3 de
/// haut), le remplissage, le glissement reflété en RTL, l'horloge, les mots dits.
@Suite("MeeshyWavePlayer")
struct MeeshyWavePlayerTests {

    private static let file = "K35-MeeshyWavePlayer"

    @Test("chaque taille rend le diamètre, le glyphe, la hauteur d'onde et l'écart du tableau")
    func recipe_sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let name = try #require(row["taille"] as? String)
            let size = try #require(MeeshyWavePlayerSize(rawValue: name))
            let recipe = Self.recipe(size: size)
            #expect(recipe.discDiameter == row["disque"] as? Double, "\(row)")
            #expect(recipe.glyphSize == row["glyphe"] as? Double, "\(row)")
            #expect(recipe.waveHeight == row["onde"] as? Double, "\(row)")
            #expect(recipe.rowHeight == row["rangee"] as? Double, "\(row)")
            #expect(recipe.gap == row["ecart"] as? Double, "\(row)")
        }
    }

    @Test("le glyphe change avec l'état : lire, pause, rejouer")
    func recipe_glyph_followsTheState() throws {
        let cases: [String: MeeshyWavePlayerRecipe] = [
            "repos": Self.recipe(isPlaying: false, progress: 0),
            "lecture": Self.recipe(isPlaying: true, progress: 0.4),
            "pause": Self.recipe(isPlaying: false, progress: 0.4),
            "termine": Self.recipe(isPlaying: false, progress: 1)
        ]
        for row in try KitAtomVectors.rows(Self.file, "glyphes") {
            let state = try #require(row["etat"] as? String)
            let recipe = try #require(cases[state])
            #expect(recipe.glyph == row["glyphe"] as? String, "\(row)")
        }
        #expect(Self.recipe(isPlaying: false, progress: 1).phaseState == .finished)
        #expect(Self.recipe(isPlaying: true, progress: 1).phaseState == .playing)
    }

    @Test("les phases tampon et indisponible se disent sans changer de forme ; indisponible n'agit pas")
    func recipe_phases() {
        #expect(Self.recipe(phase: .buffering).phaseState == .buffering)
        #expect(Self.recipe(phase: .buffering).showsRing)
        let unavailable = Self.recipe(phase: .unavailable)
        #expect(unavailable.phaseState == .unavailable)
        #expect(!unavailable.acceptsToggle)
        #expect(!unavailable.acceptsScrub)
        #expect(Self.recipe(isEnabled: false).acceptsToggle == false)
        #expect(Self.recipe().acceptsToggle)
    }

    @Test("une barre tous les 6 px au plus, quel que soit le nombre de niveaux")
    func bars_countFollowsTheWidth() throws {
        for row in try KitAtomVectors.rows(Self.file, "barres") {
            let width = try #require(row["largeur"] as? Double)
            let levels = try #require(row["niveaux"] as? Int)
            let samples = (0..<levels).map { Float($0 % 10) / 10 }
            let bars = MeeshyWaveBarsLaw.resample(samples: samples, width: width)
            #expect(bars.count == row["nombre"] as? Int, "\(row)")
            #expect(bars.allSatisfy { $0 >= 0 && $0 <= 1 }, "\(row)")
            #expect(Double(bars.count) * MeeshyWaveBarsLaw.pitch <= max(width, MeeshyWaveBarsLaw.pitch), "\(row)")
        }
    }

    @Test("zéro niveau : barres plates, jamais une onde inventée")
    func bars_withoutSamples_areFlat() {
        let bars = MeeshyWaveBarsLaw.resample(samples: [], width: 120)
        #expect(bars.count == 20)
        #expect(bars.allSatisfy { $0 == 0 })
        #expect(MeeshyWaveBarsLaw.height(normalized: 0, maxHeight: 40) == 3)
    }

    @Test("jamais de barre sous 3 de haut ; la plus forte monte au bord de la bande")
    func bars_heights() {
        #expect(MeeshyWaveBarsLaw.height(normalized: 0.001, maxHeight: 40) == 3)
        #expect(MeeshyWaveBarsLaw.height(normalized: 1, maxHeight: 40) == 40)
        #expect(MeeshyWaveBarsLaw.height(normalized: .nan, maxHeight: 40) == 3)
        #expect(MeeshyWaveBarsLaw.height(normalized: 0.25, maxHeight: 40) == 20)
    }

    @Test("le non-nombre et l'infini ne passent pas dans les niveaux")
    func bars_nonFiniteSamples() {
        let bars = MeeshyWaveBarsLaw.resample(samples: [.nan, .infinity, 0.5, -1, 9], width: 30)
        #expect(bars.count == 5)
        #expect(bars.allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 1 })
    }

    @Test("le remplissage ne dépend que du progress ; pendant un glissement il suit le doigt")
    func fill_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "remplissage") {
            let bars = try #require(row["barres"] as? Int)
            let progress = try #require(row["progress"] as? Double)
            #expect(MeeshyWaveBarsLaw.filledBars(count: bars, progress: progress) == row["pleines"] as? Int, "\(row)")
        }
        #expect(MeeshyWaveBarsLaw.displayedProgress(progress: 0.2, scrubFraction: 0.8) == 0.8)
        #expect(MeeshyWaveBarsLaw.displayedProgress(progress: 0.2, scrubFraction: nil) == 0.2)
    }

    @Test("le glissement est borné de 0 à 1 et reflété en RTL")
    func scrub_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "glissement") {
            let x = try #require(row["x"] as? Double)
            let width = try #require(row["largeur"] as? Double)
            let rtl = try #require(row["rtl"] as? Bool)
            let fraction = MeeshyWaveBarsLaw.scrubFraction(locationX: x, width: width, isRightToLeft: rtl)
            #expect(abs(fraction - (row["fraction"] as? Double ?? -1)) < 0.0001, "\(row)")
        }
    }

    @Test("l'horloge : temps restant en lecture, total au repos, « –:–– » sans durée")
    func clock_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "horloge") {
            let duration = try #require(row["duree"] as? Double)
            let progress = try #require(row["progress"] as? Double)
            let playing = try #require(row["lecture"] as? Bool)
            let name = try #require(row["mode"] as? String)
            let clock = try #require(MeeshyWavePlayerClock(rawValue: name))
            let text = MeeshyWavePlayerRecipe.clockText(duration: duration, progress: progress, isPlaying: playing, clock: clock)
            #expect(text == row["texte"] as? String, "\(row)")
        }
    }

    @Test("les mesures de la fiche : barre de 3, écart 3, zone de glissement de 44")
    func recipe_measures() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        #expect(MeeshyWaveBarsLaw.barWidth == measures["barre"])
        #expect(MeeshyWaveBarsLaw.barGap == measures["ecartBarre"])
        #expect(MeeshyWaveBarsLaw.minimumBarHeight == measures["hauteurMin"])
        let recipe = Self.recipe()
        #expect(recipe.scrubZoneHeight == measures["zoneGlissement"])
        #expect(recipe.pressedScale == measures["pressedScale"])
        #expect(recipe.scrubScale == measures["scrubScale"])
        #expect(recipe.upcomingOpacity == measures["avenir"])
        #expect(recipe.restBarOpacity == 1)
    }

    @Test("sous mouvement réduit, aucune barre ne vit mais le remplissage avance")
    func recipe_reducedMotion() {
        #expect(Self.recipe(isPlaying: true, reduceMotion: false).barsAreLive)
        #expect(!Self.recipe(isPlaying: true, reduceMotion: true).barsAreLive)
        #expect(!Self.recipe(isPlaying: false, reduceMotion: false).barsAreLive)
    }

    @Test("le nom dit : disque « Lire / Mettre en pause », onde réglable « 0:05 sur 0:09 »")
    @MainActor
    func words_areSpoken() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        #expect(MeeshyWavePlayerWords.toggleLabel(label: "Voix de Léo", isPlaying: false, bundle: fr, locale: locale) == "Lire, Voix de Léo")
        #expect(MeeshyWavePlayerWords.toggleLabel(label: "Voix de Léo", isPlaying: true, bundle: fr, locale: locale) == "Mettre en pause, Voix de Léo")
        let spoken = MeeshyWavePlayerWords.position(duration: 9, progress: 5.0 / 9.0, bundle: fr, locale: locale)
        #expect(spoken.contains("sur"), spoken)
        #expect(MeeshyWavePlayerWords.stateWord(.buffering, bundle: fr, locale: locale) != nil)
        #expect(MeeshyWavePlayerWords.stateWord(.unavailable, bundle: fr, locale: locale) != nil)
        #expect(MeeshyWavePlayerWords.stateWord(.playing, bundle: fr, locale: locale) == nil)
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucun appel de lecture, aucune ombre ni flou")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyWavePlayer.swift", "MeeshyWavePlayerRecipe.swift", "MeeshyWaveBars.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".shared", "MeeshyMessageAttachment", "MeeshyUser", "AudioPlayerManager", "AudioPlaybackManager",
                              "AVAudioPlayer", "AVPlayer", "WaveformExtractor", "ThemeManager", "Color(hex:", ".shadow(", ".blur("] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(size: MeeshyWavePlayerSize = .row,
                               phase: MeeshyWavePlayerPhase = .ready,
                               isPlaying: Bool = false,
                               progress: Double = 0,
                               isScrubbing: Bool = false,
                               isEnabled: Bool = true,
                               reduceMotion: Bool = false) -> MeeshyWavePlayerRecipe {
        MeeshyWavePlayerRecipe.resolve(size: size, phase: phase, isPlaying: isPlaying, progress: progress,
                                       isScrubbing: isScrubbing, isEnabled: isEnabled, reduceMotion: reduceMotion)
    }
}
