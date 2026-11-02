import CoreGraphics
import Foundation
import SwiftUI
import MeeshyUI

/// **Clavier OU options, jamais les deux** (règle #6156 de l'éditeur plein
/// écran, portée sur la scène par #13839, L4, état 2 de la maquette).
///
/// > « Toucher une icône remplace le clavier par ses choix. »
///
/// Toucher une famille de la barre remplace le clavier par ses options, dans un
/// panneau de la hauteur du clavier : la barre reste où elle est et la scène ne
/// bouge pas. Retoucher la même famille, ou toucher le texte, rend le clavier.
nonisolated enum ComposerKeyboardOrOptions {

    enum Input: Equatable, Sendable {
        case keyboard
        case options(ComposerKeyboardStyleFamily)

        var family: ComposerKeyboardStyleFamily? {
            if case .options(let famille) = self { return famille }
            return nil
        }
    }

    static func tapped(_ family: ComposerKeyboardStyleFamily, in input: Input) -> Input {
        input == .options(family) ? .keyboard : .options(family)
    }

    static func textTouched(_ input: Input) -> Input { .keyboard }

    /// Ce que prend le panneau quand aucun clavier n'a encore été mesuré
    /// (clavier matériel, première ouverture) : la hauteur d'un clavier
    /// d'iPhone sans sa rangée de suggestions.
    static let fallbackPanelHeight: CGFloat = 291

    /// En deçà, ce qui monte n'est pas un clavier logiciel (barre seule d'un
    /// clavier matériel, clavier flottant).
    static let minimumKeyboardHeight: CGFloat = 160

    /// **La hauteur du clavier, sans la barre** — retenue pour que le panneau
    /// d'options prenne exactement sa place. Le panneau ne se mesure jamais
    /// lui-même : seul un clavier système a quelque chose à dire.
    static func rememberedKeyboardHeight(previous: CGFloat, overlap: CGFloat,
                                         accessoryHeight: CGFloat, input: Input) -> CGFloat {
        guard input == .keyboard else { return previous }
        let clavier = overlap - accessoryHeight
        return clavier >= minimumKeyboardHeight ? clavier : previous
    }

    static func panelHeight(remembered: CGFloat) -> CGFloat {
        remembered >= minimumKeyboardHeight ? remembered : fallbackPanelHeight
    }
}

/// **La scène se réduit DANS le mouvement du clavier** (#13839, L4) : même
/// durée, même courbe, un seul mouvement — jamais le clavier puis la scène.
nonisolated enum ComposerKeyboardMotion {

    struct Timing: Equatable, Sendable {
        let duration: Double
        let announcedAt: Date
    }

    /// La durée d'un clavier quand la notification n'en donne pas.
    static let fallbackDuration: Double = 0.25

    /// Au-delà de la durée annoncée, la scène reprend son propre ressort : une
    /// feuille ouverte ensuite ne se cale pas sur un clavier déjà arrivé.
    static let liveSlack: Double = 0.1

    static func timing(duration: Double?, at date: Date) -> Timing {
        let duree = duration.flatMap { $0 > 0 ? $0 : nil } ?? fallbackDuration
        return Timing(duration: duree, announcedAt: date)
    }

    static func drivesLift(_ timing: Timing?, now: Date) -> Bool {
        guard let timing else { return false }
        let ecoule = now.timeIntervalSince(timing.announcedAt)
        return ecoule >= 0 && ecoule <= timing.duration + liveSlack
    }

    /// Le haut du clavier dans la fenêtre, ou `nil` s'il ne soulève rien
    /// (rangé, flottant, ou d'une autre fenêtre).
    static func keyboardTop(endFrame: CGRect, windowFrame: CGRect?) -> CGFloat? {
        let zone = windowFrame ?? CGRect(x: 0, y: 0, width: endFrame.maxX, height: endFrame.maxY)
        let couvert = StoryKeyboardOverlap.height(keyboardEndFrame: endFrame, windowFrame: zone, current: 0)
        guard couvert > 0 else { return nil }
        return zone.height - couvert
    }

    /// La courbe des claviers d'iOS, approchée par une Bézier, sur la durée que
    /// la notification annonce.
    static func animation(_ timing: Timing) -> Animation {
        .timingCurve(0.38, 0.7, 0.125, 1.0, duration: timing.duration)
    }
}

/// **Le clavier tel que la scène le suit** : où il s'arrête, et le mouvement
/// qui l'y amène. La scène se cale sur ce mouvement tant qu'il dure, puis
/// reprend son propre ressort (`ComposerKeyboardMotion.drivesLift`).
nonisolated struct ComposerSceneKeyboard: Equatable, Sendable {
    /// Le haut du clavier, repère global ; `nil` quand il ne soulève rien.
    private(set) var top: CGFloat?
    private(set) var timing: ComposerKeyboardMotion.Timing?

    mutating func moved(duration: Double?, endFrame: CGRect?, windowFrame: CGRect?, hidden: Bool, at date: Date) {
        timing = ComposerKeyboardMotion.timing(duration: duration, at: date)
        top = hidden ? nil : endFrame.flatMap {
            ComposerKeyboardMotion.keyboardTop(endFrame: $0, windowFrame: windowFrame)
        }
    }

    func liftAnimation(reduceMotion: Bool, now: Date) -> Animation? {
        guard !reduceMotion else { return nil }
        guard let timing, ComposerKeyboardMotion.drivesLift(timing, now: now) else {
            return .spring(response: 0.32, dampingFraction: 0.88)
        }
        return ComposerKeyboardMotion.animation(timing)
    }
}
