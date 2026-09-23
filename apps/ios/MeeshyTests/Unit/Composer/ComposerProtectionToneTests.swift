import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// La barre du composeur prend la couleur de la protection la plus forte (#7667).
///
/// Directive porteur 2026-09-24 : « L'universal bar adopte la couleur de
/// l'effet le plus impactant éphémère > vue unique > flou […] Le message ne
/// peut pas être flou et vue unique ! »
///
/// Les huit combinaisons des trois bascules sont énumérées : une règle de
/// priorité testée sur trois cas seulement laisse passer l'ordre inverse dès
/// que deux bascules sont allumées ensemble.
final class ComposerProtectionToneTests: XCTestCase {

    // MARK: - La protection dominante, sur les huit combinaisons

    func test_dominant_aucuneBascule_rendNil() {
        XCTAssertNil(ComposerProtection.dominant(ephemeral: false, viewOnce: false, blurred: false))
    }

    func test_dominant_flouSeul_rendFlou() {
        XCTAssertEqual(ComposerProtection.dominant(ephemeral: false, viewOnce: false, blurred: true), .blurred)
    }

    func test_dominant_vueUniqueSeule_rendVueUnique() {
        XCTAssertEqual(ComposerProtection.dominant(ephemeral: false, viewOnce: true, blurred: false), .viewOnce)
    }

    func test_dominant_vueUniqueEtFlou_rendVueUnique() {
        XCTAssertEqual(ComposerProtection.dominant(ephemeral: false, viewOnce: true, blurred: true), .viewOnce)
    }

    func test_dominant_ephemereSeul_rendEphemere() {
        XCTAssertEqual(ComposerProtection.dominant(ephemeral: true, viewOnce: false, blurred: false), .ephemeral)
    }

    func test_dominant_ephemereEtFlou_rendEphemere() {
        XCTAssertEqual(ComposerProtection.dominant(ephemeral: true, viewOnce: false, blurred: true), .ephemeral)
    }

    func test_dominant_ephemereEtVueUnique_rendEphemere() {
        XCTAssertEqual(ComposerProtection.dominant(ephemeral: true, viewOnce: true, blurred: false), .ephemeral)
    }

    func test_dominant_lesTrois_rendEphemere() {
        XCTAssertEqual(ComposerProtection.dominant(ephemeral: true, viewOnce: true, blurred: true), .ephemeral)
    }

    // MARK: - Une protection a UNE couleur partout

    /// La teinte de la barre est celle que le fil peint sur la capsule de la
    /// même protection (`MessageProtectionChrome.presentation`, #7599) — pas
    /// une seconde table qui divergerait au premier réglage.
    func test_teinte_estCelleDuChromeDuFil() {
        XCTAssertEqual(ComposerProtection.ephemeral.tintHex,
                       MessageProtectionChrome.presentation(for: .ephemeral(.awaitingReception(duration: 60))).tintHex)
        XCTAssertEqual(ComposerProtection.viewOnce.tintHex,
                       MessageProtectionChrome.presentation(for: .viewOnce).tintHex)
        XCTAssertEqual(ComposerProtection.blurred.tintHex,
                       MessageProtectionChrome.presentation(for: .blurred).tintHex)
    }

    func test_teinte_lesTroisProtectionsSontDistinctes() {
        let teintes = Set(ComposerProtection.allCases.map(\.tintHex))
        XCTAssertEqual(teintes.count, ComposerProtection.allCases.count)
    }

    // MARK: - L'accent servi à la barre

    func test_accentServi_sansProtection_gardeLAccentDeLHote() {
        let accent = ComposerProtection.servedAccent(for: nil, hostAccent: "FF00AA", hostSecondary: "00AAFF")
        XCTAssertEqual(accent.primary, "FF00AA")
        XCTAssertEqual(accent.secondary, "00AAFF")
    }

    func test_accentServi_avecProtection_prendLaTeinteSurLesDeuxArrets() {
        for protection in ComposerProtection.allCases {
            let accent = ComposerProtection.servedAccent(for: protection, hostAccent: "FF00AA", hostSecondary: "00AAFF")
            XCTAssertEqual(accent.primary, protection.tintHex)
            XCTAssertEqual(accent.secondary, protection.tintHex,
                           "un second arrêt resté à l'accent de l'hôte donnerait un dégradé hybride")
        }
    }

    // MARK: - Flou et vue unique sont exclusifs

    func test_basculerFlou_depuisVueUnique_eteintLaVueUnique() {
        let etat = ComposerProtection.togglingVeil(.blurred, blurred: false, viewOnce: true)
        XCTAssertEqual(etat.blurred, true)
        XCTAssertEqual(etat.viewOnce, false)
    }

    func test_basculerVueUnique_depuisFlou_eteintLeFlou() {
        let etat = ComposerProtection.togglingVeil(.viewOnce, blurred: true, viewOnce: false)
        XCTAssertEqual(etat.blurred, false)
        XCTAssertEqual(etat.viewOnce, true)
    }

    func test_basculerFlou_actif_leDesarmeSansToucherLaVueUnique() {
        let etat = ComposerProtection.togglingVeil(.blurred, blurred: true, viewOnce: false)
        XCTAssertEqual(etat.blurred, false)
        XCTAssertEqual(etat.viewOnce, false)
    }

    func test_basculerVueUnique_active_laDesarme() {
        let etat = ComposerProtection.togglingVeil(.viewOnce, blurred: false, viewOnce: true)
        XCTAssertEqual(etat.blurred, false)
        XCTAssertEqual(etat.viewOnce, false)
    }

    /// L'éphémère n'est pas un voile : le passer ici ne touche à rien.
    func test_basculerEphemere_nestPasUnVoile() {
        let etat = ComposerProtection.togglingVeil(.ephemeral, blurred: true, viewOnce: false)
        XCTAssertEqual(etat.blurred, true)
        XCTAssertEqual(etat.viewOnce, false)
    }

    // MARK: - Le lecteur d'écran entend l'état dominant

    func test_etatAnnonce_nonVidePourChaqueProtection() {
        for protection in ComposerProtection.allCases {
            XCTAssertFalse(protection.accessibilityState.isEmpty)
        }
        XCTAssertNotEqual(ComposerProtection.viewOnce.accessibilityState,
                          ComposerProtection.blurred.accessibilityState)
    }
}
