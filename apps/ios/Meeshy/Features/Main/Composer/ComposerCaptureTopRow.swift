import Foundation
import CoreGraphics

/// Un contrôle de la rangée haute du viseur.
nonisolated enum ComposerCaptureTopItem: Equatable, Hashable, Sendable {
    /// (x) : quitte le viseur, ou abandonne la retouche.
    case close
    /// La puce du chrono et de l'indicateur de segment.
    case chrono
    /// `[ ]` : carte ↔ plein écran.
    case size
    /// Retirer le dernier segment.
    case dropSegment
    /// ✓ : poser les segments.
    case validate
    case flash
    /// Changer d'objectif.
    case flip
    /// ⬇︎ : la prise retouchée rejoint Photos.
    case save
    /// « Terminé ».
    case done
}

/// **La rangée haute du viseur — sa disposition, décidée ici et nulle part
/// ailleurs** (#9753, directive porteur 2026-10-09).
///
/// > « Le bouton de changement de caméra se met à DROITE du bouton du flash.
/// > Quand on filme : les contrôleurs de segment se placent à GAUCHE de ces deux
/// > boutons. La puce du chrono avec l'indicateur de segment se place à DROITE
/// > du bouton (x). »
///
/// À gauche, la croix puis — dès qu'une vidéo se prend — la puce du chrono. À
/// droite, de l'intérieur vers le bord : `[ ]`, les contrôleurs de segment, le
/// flash, le retournement. Pendant l'enregistrement, seuls la croix et le chrono
/// restent : le zoom passe au glissé, et rien d'autre ne se règle en filmant.
/// Dès que des segments attendent, `[ ]` cède sa place : la rangée tient alors
/// sept contrôles, et la largeur d'un iPhone n'en porte pas huit.
nonisolated enum ComposerCaptureTopRow {

    /// L'écart entre deux contrôles de la rangée.
    static let spacing: CGFloat = 4

    nonisolated struct Input: Equatable, Sendable {
        var stage: ComposerSceneCameraStage
        var editing = false
        var pendingSegments = 0
        var offersSizeToggle = true
        var offersSave = false
    }

    /// Ce qui ouvre la rangée, de gauche à droite.
    static func leading(_ input: Input) -> [ComposerCaptureTopItem] {
        guard !input.editing, showsChrono(input) else { return [.close] }
        return [.close, .chrono]
    }

    /// Ce qui la ferme, de gauche à droite — le dernier touche le bord.
    static func trailing(_ input: Input) -> [ComposerCaptureTopItem] {
        if input.editing {
            return (input.offersSizeToggle ? [.size] : []) + (input.offersSave ? [.save] : []) + [.done]
        }
        guard input.stage != .recording else { return [] }
        let segments = input.pendingSegments > 0
        let taille: [ComposerCaptureTopItem] = input.offersSizeToggle && !segments ? [.size] : []
        let controleurs: [ComposerCaptureTopItem] = segments ? [.dropSegment, .validate] : []
        return taille + controleurs + [.flash, .flip]
    }

    /// La puce paraît dès qu'une vidéo se prend : en filmant, ou segments en attente.
    static func showsChrono(_ input: Input) -> Bool {
        input.stage == .recording || input.pendingSegments > 0
    }

    /// **L'indicateur de segment compte celui qui s'écrit** : le premier
    /// enregistrement est le segment 1, pas le segment 0.
    static func segmentCount(pending: Int, recording: Bool) -> Int {
        max(0, pending) + (recording ? 1 : 0)
    }

    /// **Le curseur d'intensité se pose SOUS le flash** : son retrait depuis le
    /// bord droit compte les contrôles posés à droite du flash.
    static func flashSliderTrailingInset(_ trailing: [ComposerCaptureTopItem], tapTarget: CGFloat) -> CGFloat {
        guard let rang = trailing.firstIndex(of: .flash) else { return 0 }
        let aDroite = CGFloat(trailing.count - 1 - rang)
        return aDroite * (tapTarget + spacing)
    }
}

/// **(x) ne jette jamais une prise en silence** (#9753, porteur 2026-10-09 :
/// « toucher (x) pendant un enregistrement demande CONFIRMATION avant de perdre
/// l'enregistrement ») — ni celle qui tourne, ni des segments qui attendent
/// leur ✓ (#9351). Hors de ces deux cas, (x) garde son comportement : il ferme,
/// ou abandonne la retouche.
nonisolated enum ComposerCaptureDiscardRule {
    static func asksBeforeClosing(stage: ComposerSceneCameraStage, editing: Bool,
                                  segments: [ComposerCaptureSegment]) -> Bool {
        guard !editing else { return false }
        return stage == .recording || ComposerCaptureSegments.asksBeforeClosing(segments)
    }
}

/// **Le curseur du flash s'efface après 2 s sans interaction** (#9753, porteur
/// 2026-10-09). Toute interaction — allumer le flash, glisser le curseur, le
/// régler à la voix — le fait paraître et réarme la minuterie ; un doigt posé
/// dessus le retient. Seule l'échéance de la DERNIÈRE interaction l'efface : une
/// échéance plus ancienne est périmée. VoiceOver le garde affiché : un élément
/// qui s'efface sous le curseur d'accessibilité n'est plus atteignable.
nonisolated struct ComposerFlashSliderTimer: Equatable, Sendable {
    static let lifetime: TimeInterval = 2

    private(set) var generation = 0
    private(set) var visible = false
    private(set) var held = false

    /// Une interaction : le curseur paraît, la minuterie repart.
    mutating func touch() {
        visible = true
        generation += 1
    }

    /// Le doigt se pose ou se lève sur le curseur.
    mutating func hold(_ tenu: Bool) {
        held = tenu
        touch()
    }

    /// Le flash s'éteint : plus d'intensité à régler.
    mutating func hide() {
        visible = false
        held = false
        generation += 1
    }

    /// L'échéance de l'interaction `generation` est atteinte.
    mutating func expire(_ generation: Int, voiceOver: Bool) {
        guard generation == self.generation, !held, !voiceOver else { return }
        visible = false
    }
}
