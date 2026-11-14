import Foundation
import CoreGraphics
import Testing
@testable import MeeshyUI

/// **L'appui des boutons partagés suit « Réduire les animations »** (#18534).
///
/// `pressable()`, `bounceOnTap(scale:)` et `bounceOnFocus(_:)` gardent leurs
/// échelles de surface sans verre, mais aucune ne joue sous réduction : seul le
/// voile de luminosité de `pressable()` reste (K02 § 4). Le bouton flottant de
/// la racine prend l'appui du verre du kit, piloté par la loi de son geste.
@Suite("Réponse à l'appui")
struct PressResponseMotionTests {

    // MARK: - pressable()

    @Test func pressable_sansReduction_garde_son_echelle() {
        #expect(PressableButton.effectiveScale(isPressed: true, reduceMotion: false) == 0.93)
        #expect(PressableButton.effectiveScale(isPressed: false, reduceMotion: false) == 1)
    }

    @Test func pressable_sousReduction_ne_change_pas_d_echelle() {
        #expect(PressableButton.effectiveScale(isPressed: true, reduceMotion: true) == 1)
    }

    @Test func pressable_garde_son_voile_sous_reduction() {
        #expect(PressableButton.effectiveBrightness(isPressed: true) < 0)
        #expect(PressableButton.effectiveBrightness(isPressed: false) == 0)
    }

    // MARK: - bounceOnTap(scale:)

    @Test func bounceOnTap_sansReduction_prend_l_echelle_demandee() {
        #expect(BounceOnTap.effectiveScale(isPressed: true, pressedScale: 0.9, reduceMotion: false) == 0.9)
        #expect(BounceOnTap.effectiveScale(isPressed: false, pressedScale: 0.9, reduceMotion: false) == 1)
    }

    @Test func bounceOnTap_sousReduction_ne_change_pas_d_echelle() {
        #expect(BounceOnTap.effectiveScale(isPressed: true, pressedScale: 0.9, reduceMotion: true) == 1)
    }

    // MARK: - bounceOnFocus(_:)

    @Test func bounceOnFocus_sansReduction_grossit_a_la_mise_au_point() {
        #expect(BounceOnFocus.effectiveScale(focused: true, reduceMotion: false) == 1.02)
        #expect(BounceOnFocus.effectiveScale(focused: false, reduceMotion: false) == 1)
    }

    @Test func bounceOnFocus_sousReduction_ne_change_pas_d_echelle() {
        #expect(BounceOnFocus.effectiveScale(focused: true, reduceMotion: true) == 1)
    }

    // MARK: - Le bouton flottant

    @Test func boutonFlottant_est_presse_des_le_premier_changement() {
        #expect(FloatingButtonPress.isPressed(after: .changed(.zero), threshold: 12))
        #expect(FloatingButtonPress.isPressed(after: .changed(CGSize(width: 4, height: 3)), threshold: 12))
    }

    @Test func boutonFlottant_n_est_plus_presse_a_la_fin() {
        #expect(!FloatingButtonPress.isPressed(after: .ended(.zero), threshold: 12))
    }

    @Test func boutonFlottant_un_glisser_au_dela_du_seuil_n_est_pas_un_appui() {
        let drag = CGSize(width: 0, height: 20)
        #expect(!FloatingButtonPress.isPressed(after: .changed(drag), threshold: 12))
        #expect(!FloatingButtonPress.isPressed(after: .changed(CGSize(width: 12, height: 0)), threshold: 12))
    }

    @Test func boutonFlottant_grossit_au_glisser_comme_l_echelle_du_menu_sauf_sous_reduction() {
        #expect(FloatingButtonPress.dragScale(isDragging: true, reduceMotion: false) == FloatingMenuLadderFollow.discScale)
        #expect(FloatingButtonPress.dragScale(isDragging: true, reduceMotion: true) == 1)
        #expect(FloatingButtonPress.dragScale(isDragging: false, reduceMotion: false) == 1)
    }

    // MARK: - Garde de source

    private static let guardedFiles = [
        "Sources/MeeshyUI/Primitives/FloatingButtons.swift",
        "Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift",
        "Sources/MeeshyUI/Media/VideoTransportControls.swift",
    ]

    private static func source(_ relative: String) throws -> String {
        let url = ComposerSourceGuard.packageRoot.appendingPathComponent(relative)
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    @Test(arguments: guardedFiles)
    func aucun_disque_de_verre_fait_main(_ relative: String) throws {
        let code = try Self.source(relative).filter { !$0.isWhitespace }
        #expect(!code.contains("Circle().fill(.ultraThinMaterial"), "\(relative) peint un disque de matière à la main")
        #expect(!code.contains(".adaptiveGlass(in:Circle(),interactive:true)"), "\(relative) pose un verre interactif hors du kit")
    }

    private static let videoControlFiles = [
        "Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift",
        "Sources/MeeshyUI/Media/VideoTransportControls.swift",
    ]

    @Test(arguments: videoControlFiles)
    func commandes_video_suivent_l_appui_du_bouton_sans_geste_qui_gene_le_defilement(_ relative: String) throws {
        let code = try Self.source(relative)
        #expect(!code.contains(".pressable()"), "\(relative) pose un geste d'appui dans une vidéo qui défile avec son fil")
        #expect(code.contains("PressableButtonStyle()"), "\(relative) ne suit plus l'appui de son bouton")
    }

    /// Les deux boutons flottants (libre et hérité) s'écrasent par la MÊME loi
    /// pendant l'appui long, et l'appui long dure ce que dure l'écrasement (#18428).
    @Test func les_deux_boutons_flottants_s_ecrasent_par_la_loi_de_l_appui_long() throws {
        let code = try Self.source("Sources/MeeshyUI/Primitives/FloatingButtons.swift")
        #expect(code.components(separatedBy: ".modifier(FloatingButtonHoldSquashEffect(isHolding: isHolding, hasLongPress: onLongPress != nil))").count - 1 == 2,
                "chaque bouton flottant doit s'écraser, ou s'estomper sous réduction, par FloatingButtonHoldSquash")
        #expect(code.components(separatedBy: ".updating($isHolding)").count - 1 == 2,
                "l'écrasement suit le doigt tenu par l'état du geste d'appui long, relâché à l'ouverture ou à l'abandon")
        #expect(code.components(separatedBy: "LongPressGesture(minimumDuration: FloatingButtonHoldSquash.holdDuration)").count - 1 == 2,
                "l'appui long doit durer ce que dure l'écrasement")
        #expect(!code.contains("minimumDuration: 0.5"), "durée d'appui long littérale, détachée de l'écrasement")
    }

    @Test(arguments: guardedFiles)
    func aucun_style_d_appui_prive_a_echelle(_ relative: String) throws {
        let code = try Self.source(relative)
        #expect(!code.contains("ButtonStyle {"), "\(relative) déclare un style d'appui privé")
        #expect(!code.contains(".spring(response:"), "\(relative) anime par un ressort littéral")
    }
}
