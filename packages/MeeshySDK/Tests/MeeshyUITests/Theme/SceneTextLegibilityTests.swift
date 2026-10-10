import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

/// **Un texte posé sur la scène tient 4,5:1 sur TOUTE la palette du composer** (#9450).
///
/// La légende du composer se pose sans bulle (#5008). Sur le rose `FF2E63`, l'invite
/// « Touchez pour écrire » mesurait 2,71:1 sur le flou. Le modèle mesuré ici est celui
/// que l'on peut calculer : la scène, le voile sans bord de la polarité opposée à
/// l'encre (`legibilityHalo` à `sceneTextVeilOpacity`), et l'encre que le schéma élu
/// commande (`sceneTextInk`). Le flou `.ultraThinMaterial` reste dessous, NON compté :
/// il ne se rend pas hors appareil, et il pousse vers la même polarité que le voile.
///
/// Les dégradés sont échantillonnés sur toute leur course : la luminance d'un mélange
/// sRGB est convexe, son minimum peut tomber ENTRE les deux arrêts (`9B59B6 → FF6B6B`
/// descend sous ses deux extrémités). Le schéma, lui, reste celui de la loi — la
/// moyenne des deux arrêts —, donc l'encre est celle que l'écran peint vraiment.
@MainActor
final class SceneTextLegibilityTests: XCTestCase {

    private let aa = 4.5

    private func rgb(_ hex: String) -> (Double, Double, Double) {
        let v = UInt32(hex, radix: 16) ?? 0
        return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
    }

    private func rgb(_ color: Color) -> (Double, Double, Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        _ = UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }

    private func mix(_ a: (Double, Double, Double), _ b: (Double, Double, Double), _ t: Double) -> (Double, Double, Double) {
        (a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t, a.2 + (b.2 - a.2) * t)
    }

    /// Le pire contraste de l'encre de scène sur un fond sérialisé et les couleurs
    /// réellement peintes sous le texte.
    private func worstRatio(background: String, painted: [(Double, Double, Double)]) -> Double {
        let scheme = CanvasChromeScheme.scheme(background: background, hasMediaBackground: false)
        let ink = rgb(CanvasChromeScheme.sceneTextInk(for: scheme))
        let inkLuminance = CanvasChromeScheme.luminance(red: ink.0, green: ink.1, blue: ink.2)
        return painted.map { c in
            CanvasChromeScheme.contrastRatio(
                inkLuminance,
                CanvasChromeScheme.luminanceUnderSceneTextVeil(red: c.0, green: c.1, blue: c.2, scheme: scheme))
        }.min() ?? 0
    }

    private var paletteCases: [(name: String, background: String, painted: [(Double, Double, Double)])] {
        let solids = StoryBackgroundPalette.colors.map { (name: $0, background: $0, painted: [rgb($0)]) }
        let gradients = StoryBackgroundPalette.gradients.map { pair in
            (name: "\(pair.0)→\(pair.1)",
             background: "gradient:\(pair.0):\(pair.1)",
             painted: (0...20).map { mix(rgb(pair.0), rgb(pair.1), Double($0) / 20) })
        }
        return solids + gradients
    }

    func test_laPalette_estCouverte() {
        XCTAssertEqual(paletteCases.count,
                       StoryBackgroundPalette.colors.count + StoryBackgroundPalette.gradients.count)
        XCTAssertTrue(StoryBackgroundPalette.colors.contains("FF2E63"),
                      "la teinte du constat (#9450) doit rester mesurée")
    }

    /// L'invite ET le texte saisi portent la même encre de scène : un seul balayage les
    /// juge tous deux, mentions et hashtags compris (le calque les peint de cette encre,
    /// distingués par leur graisse et leur soulignement).
    func test_lEncreDeScene_tient45SurToutLaPaletteDuComposer() {
        for c in paletteCases {
            let ratio = worstRatio(background: c.background, painted: c.painted)
            XCTAssertGreaterThanOrEqual(ratio, aa, "\(c.name) : \(String(format: "%.2f", ratio)):1")
        }
    }

    /// Les fonds pastel tirés au hasard (`randomBackgroundColor`, S 0,14…0,24,
    /// B 0,93…0,98) sont balayés à leurs coins, sur tout le cercle des teintes.
    func test_lEncreDeScene_tient45SurLesPastelsAleatoires() {
        for hue in stride(from: 0.0, to: 1.0, by: 1.0 / 72) {
            for (s, b) in [(0.14, 0.93), (0.24, 0.93), (0.14, 0.98), (0.24, 0.98)] {
                var r: CGFloat = 0, g: CGFloat = 0, bl: CGFloat = 0
                UIColor(hue: hue, saturation: s, brightness: b, alpha: 1).getRed(&r, green: &g, blue: &bl, alpha: nil)
                let hex = String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(bl * 255))
                let ratio = worstRatio(background: hex, painted: [rgb(hex)])
                XCTAssertGreaterThanOrEqual(ratio, aa, "pastel \(hex) : \(ratio)")
            }
        }
    }

    /// **Le constat, refait sur le modèle.** Le rose `FF2E63` (L 0,24) est le pire cas
    /// que la recette a vu : sans voile, même l'encre PRIMAIRE n'y tient pas 4,5:1.
    func test_leRoseDuConstat_neTenaitPasSansVoile_etTientAvec() {
        let rose = rgb("FF2E63")
        let scheme = CanvasChromeScheme.scheme(background: "FF2E63", hasMediaBackground: false)
        XCTAssertEqual(scheme, .light)
        let ink = rgb(CanvasChromeScheme.sceneTextInk(for: scheme))
        let inkL = CanvasChromeScheme.luminance(red: ink.0, green: ink.1, blue: ink.2)
        let nu = CanvasChromeScheme.contrastRatio(inkL, CanvasChromeScheme.luminance(red: rose.0, green: rose.1, blue: rose.2))
        XCTAssertLessThan(nu, aa, "à nu, la frontière de schéma ne suffit pas — c'est ce qui rend le voile nécessaire")
        XCTAssertGreaterThanOrEqual(worstRatio(background: "FF2E63", painted: [rose]), aa)
    }

    /// **L'encre secondaire ne peut PAS servir l'invite**, et c'est mesuré : posée sur du
    /// blanc PUR — le fond le plus favorable qu'un voile clair puisse produire —,
    /// `textSecondary(isDark: false)` ne dépasse guère 5:1 ; sur le rose voilé, elle
    /// tombe sous 4,5:1. Si ce témoin rougit, c'est que le jeton a changé : relire
    /// `sceneTextInk` avant de l'y remettre.
    func test_lEncreSecondaire_neTientPasSurLeRoseVoile() {
        let secondaryTop = rgb(MeeshyColors.indigo700)
        let a = 0.8
        let veiled: (Double, Double, Double) = {
            let rose = rgb("FF2E63"), v = CanvasChromeScheme.sceneTextVeilOpacity
            return (rose.0 * (1 - v) + v, rose.1 * (1 - v) + v, rose.2 * (1 - v) + v)
        }()
        let ink = (secondaryTop.0 * a + veiled.0 * (1 - a),
                   secondaryTop.1 * a + veiled.1 * (1 - a),
                   secondaryTop.2 * a + veiled.2 * (1 - a))
        let ratio = CanvasChromeScheme.contrastRatio(
            CanvasChromeScheme.luminance(red: ink.0, green: ink.1, blue: ink.2),
            CanvasChromeScheme.luminance(red: veiled.0, green: veiled.1, blue: veiled.2))
        XCTAssertLessThan(ratio, aa)
    }

    /// **Le voile reste DISCRET** : un voile opaque serait une bulle qui ne dit pas son
    /// nom (#5008). La borne haute garde la directive ; la borne basse garde le contraste.
    func test_leVoile_resteUnVoile() {
        XCTAssertGreaterThan(CanvasChromeScheme.sceneTextVeilOpacity, 0)
        XCTAssertLessThanOrEqual(CanvasChromeScheme.sceneTextVeilOpacity, 0.35)
    }

    func test_lEncreDeScene_estLEncrePrimaire() {
        XCTAssertEqual(CanvasChromeScheme.sceneTextInk(for: .dark), MeeshyColors.textPrimary(isDark: true))
        XCTAssertEqual(CanvasChromeScheme.sceneTextInk(for: .light), MeeshyColors.textPrimary(isDark: false))
    }

    func test_contrastRatio_noirSurBlanc_vaut21() {
        XCTAssertEqual(CanvasChromeScheme.contrastRatio(0, 1), 21, accuracy: 0.0001)
        XCTAssertEqual(CanvasChromeScheme.contrastRatio(1, 0), 21, accuracy: 0.0001)
    }

    func test_luminance_rejointLaLuminanceDuHex() {
        let c = rgb("FF2E63")
        XCTAssertEqual(CanvasChromeScheme.luminance(red: c.0, green: c.1, blue: c.2),
                       CanvasChromeScheme.relativeLuminance(hex: "FF2E63") ?? -1, accuracy: 0.0001)
    }
}
