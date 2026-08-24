import Foundation
import XCTest
@testable import Meeshy

/// Confrontation mécanique des systèmes de particules DÉCLARÉS avec ceux
/// réellement MONTÉS par `MessageEffectsModifier`.
///
/// `ExplodeOverlay` et `WaooOverlay` ont vécu déclarés et jamais montés : seuls
/// `ConfettiOverlay` et `FireworksOverlay` figuraient dans l'`.overlay` du
/// modifier. Les drapeaux `explode` et `waoo` jouaient donc leur transform —
/// échelle, halo — pendant que leur centaine de lignes de particules ne
/// s'exécutait jamais. Aucun test ne rougissait : le plan de lecture
/// (`MessageEffectPlan`) est correct, les deux vues compilent, et l'effet
/// PARAÎT jouer puisque son transform, lui, est bien monté.
///
/// C'est la forme « capacité déclarée, jamais câblée » : le code existe, le
/// drapeau voyage jusqu'au serveur, et pourtant l'utilisateur ne voit pas ce
/// qu'il a demandé. Une garde de rendu drapeau par drapeau est hors de portée
/// sans harnais de snapshot ; le montage, lui, se vérifie sur le texte source
/// et c'est exactement la marche manquée.
///
/// La garde exige l'égalité des deux ensembles. Un overlay neuf qu'on oublie de
/// brancher fait rougir — et un overlay volontairement non monté doit être
/// justifié dans l'allowlist ci-dessous, jamais laissé muet.
final class EffectOverlayMountingSourceGuardTests: XCTestCase {

    /// Overlays délibérément déclarés sans être montés par le modifier.
    /// Vide aujourd'hui, et c'est l'état sain : tout ce qui est décrit se joue.
    private static let deliberatelyUnmounted: Set<String> = []

    private var effectModifiersSource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageEffectModifiers.swift")
    }

    /// Le fichier documente ses effets en prose abondante et cite les noms
    /// d'overlays dans ses commentaires. Sans dépouillement, la garde
    /// compterait la documentation comme un montage et serait verte à tort.
    private func strippedSource() throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: effectModifiersSource, encoding: .utf8))
    }

    private func matches(_ pattern: String, in source: String, group: Int = 1) -> Set<String> {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(source.startIndex..., in: source)
        return Set(regex.matches(in: source, range: range).compactMap { match in
            Range(match.range(at: group), in: source).map { String(source[$0]) }
        })
    }

    // MARK: - Balayage

    func test_everyDeclaredParticleOverlay_isMountedByTheModifier() throws {
        let source = try strippedSource()

        let declared = matches(#"struct\s+(\w*Overlay)\s*:\s*View"#, in: source)
        let mounted = matches(#"(\w*Overlay)\s*\("#, in: source)

        XCTAssertFalse(declared.isEmpty,
                       "Balayage vide : le dépouillement a trop mangé, ou le fichier a bougé. "
                       + "Un balayage vide ne doit jamais être indiscernable d'un succès.")

        let unmounted = declared.subtracting(mounted).subtracting(Self.deliberatelyUnmounted)
        XCTAssertTrue(
            unmounted.isEmpty,
            "Overlay(s) déclaré(s) mais jamais monté(s) par MessageEffectsModifier : "
            + "\(unmounted.sorted().joined(separator: ", ")). "
            + "Le drapeau correspondant joue son transform sans jamais lancer ses particules. "
            + "Brancher l'overlay, ou l'inscrire dans `deliberatelyUnmounted` AVEC sa raison."
        )
    }

    func test_allowlist_containsNoStaleEntry() throws {
        let declared = matches(#"struct\s+(\w*Overlay)\s*:\s*View"#, in: try strippedSource())
        let stale = Self.deliberatelyUnmounted.subtracting(declared)

        XCTAssertTrue(
            stale.isEmpty,
            "Entrée(s) périmée(s) dans l'allowlist — l'overlay n'existe plus : "
            + "\(stale.sorted().joined(separator: ", ")). "
            + "Une allowlist qu'on ne relit pas finit par autoriser ce qui n'existe pas."
        )
    }

    /// Les quatre drapeaux d'apparition à particules doivent chacun garder leur
    /// montage conditionnel. Sans cette garde, brancher les overlays « en dur »
    /// (hors de tout `plan.appearance.contains`) satisferait la garde
    /// précédente tout en jouant les particules sur TOUS les messages.
    func test_eachParticleOverlay_isMountedBehindItsOwnFlag() throws {
        let source = try strippedSource()

        for (flag, overlay) in [("confetti", "ConfettiOverlay"),
                                ("fireworks", "FireworksOverlay"),
                                ("explode", "ExplodeOverlay"),
                                ("waoo", "WaooOverlay")] {
            let guarded = matches(
                #"contains\(\.\#(flag)\)\s*\{\s*\#(overlay)\("#,
                in: source,
                group: 0   // le motif n'a pas de groupe capturant : c'est la correspondance entière qui porte la preuve
            )
            XCTAssertFalse(
                guarded.isEmpty,
                "\(overlay) n'est pas monté derrière `plan.appearance.contains(.\(flag))`. "
                + "Un overlay monté sans condition joue ses particules sur tous les messages."
            )
        }
    }

    // MARK: - Directive 2026-08-24 — « quelque chose de visuellement plus esthétique »

    /// Le spectre boucle sur sa première couleur : un `AngularGradient` dont
    /// les deux extrémités diffèrent montre une COUTURE — un trait net là où
    /// la dernière couleur retombe sur la première. C'est ce qui donnait à
    /// l'ancien cadre son air d'autocollant.
    func test_theSpectrum_loopsBackToItsFirstColor_soTheGradientHasNoSeam() {
        let spectrum = RainbowEffect.spectrum(from: nil)
        XCTAssertGreaterThan(spectrum.count, 2)
        XCTAssertEqual(spectrum.first, spectrum.last, "sans bouclage, la roue a une couture visible")
    }

    /// **`rainbowColors` était décodé, testé côté modèle, et JAMAIS rendu.**
    /// L'auteur pouvait choisir ses couleurs : le rendu affichait les siennes.
    /// Lecture morte — la garde suivante l'empêche de le redevenir.
    func test_theAuthorsOwnColors_areUsed_notJustDecoded() {
        let spectrum = RainbowEffect.spectrum(from: ["#112233", "#445566"])
        XCTAssertEqual(spectrum, ["#112233", "#445566", "#112233"], "les couleurs de l'auteur, bouclées")
    }

    func test_aSingleAuthorColor_stillMakesAUsableGradient() {
        XCTAssertEqual(RainbowEffect.spectrum(from: ["#ABCDEF"]), ["#ABCDEF", "#ABCDEF"])
    }

    func test_anEmptyAuthorPalette_fallsBackToTheHouseSpectrum() {
        XCTAssertEqual(RainbowEffect.spectrum(from: []), RainbowEffect.spectrum(from: nil))
    }

    /// Le spectre de la maison s'ancre sur la marque et n'emploie que des
    /// teintes de MÊME clarté — c'est ce qui sépare une aurore d'un arc-en-ciel
    /// d'école. Les trois tokens déjà nommés par la charte doivent s'y trouver.
    func test_theHouseSpectrum_isAnchoredOnTheBrandTokens() {
        let spectrum = RainbowEffect.spectrum(from: nil).map { $0.uppercased() }
        XCTAssertEqual(spectrum.first, "#818CF8", "l'indigo de la marque ouvre et ferme la roue")
        XCTAssertTrue(spectrum.contains("#34D399"), "success")
        XCTAssertTrue(spectrum.contains("#FBBF24"), "warning")
    }

    /// Garde de source — le rendu ne doit plus DÉNATURER les couleurs qu'on
    /// vient de lui confier : `hueRotation` faisait tourner la teinte, donc un
    /// auteur qui choisissait du bleu voyait passer du rouge. Le mouvement est
    /// désormais une rotation du dégradé lui-même.
    func test_theEffect_rotatesTheGradient_neverTheHue() throws {
        let source = try String(contentsOf: effectModifiersSource, encoding: .utf8)
        let rainbow = try XCTUnwrap(source.range(of: "struct RainbowEffect"))
        let body = String(source[rainbow.lowerBound...].prefix(3600))
        XCTAssertFalse(body.contains("hueRotation"), "la teinte de l'auteur n'est plus tournée")
        XCTAssertTrue(body.contains("angle: .degrees("), "le dégradé lui-même tourne")
        XCTAssertTrue(body.contains(".blur("), "un halo diffus, pas seulement un trait")
        XCTAssertTrue(body.contains("cornerRadius: cornerRadius"), "le liseré épouse la forme qu'on lui donne")
    }

    func test_theGuardAbove_wouldCatchAHueRotationComingBack() {
        XCTAssertTrue("… .hueRotation(.degrees(rotation)) …".contains("hueRotation"))
    }
}
