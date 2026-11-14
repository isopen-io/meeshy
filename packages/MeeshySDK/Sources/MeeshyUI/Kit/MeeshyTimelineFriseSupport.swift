import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Ce qu'un doigt tient sur une barre : la piste, la partie, l'aperçu local de
/// sa fenêtre, et si le geste a été rendu à l'hôte (glissé vertical) ou cédé
/// à un pincement.
nonisolated struct MeeshyTimelineFriseHeld: Sendable, Equatable {
    let trackID: String
    let part: MeeshyTimelineFrisePart
    let preview: MeeshyTimelineFriseDrag
    let isIgnored: Bool
}

/// Ce que le clavier peut viser : la règle, une piste, ou l'une de ses poignées.
nonisolated enum MeeshyTimelineFriseFocus: Hashable, Sendable {
    case ruler
    case track(String)
    case handle(String, MeeshyTimelineFrisePart)
}

/// Les rappels de l'hôte, rassemblés pour être joués.
struct MeeshyTimelineFriseHostCalls {
    let onSelect: (String, Double?) -> Void
    let onSeek: ((Double) -> Void)?
    let onWindowCommit: ((String, ClosedRange<Double>, MeeshyTimelineFrisePart) -> Void)?
    let onKeyframe: ((String, String) -> Void)?
    let onEditingChanged: ((MeeshyTimelineFrisePart, Bool) -> Void)?
    let announce: (String, ClosedRange<Double>) -> Void
}

/// Joue les effets d'une interaction : l'hôte reçoit le choix, la tête, la
/// fenêtre et l'édition ; le tic passe par `HapticFeedback`.
enum MeeshyTimelineFriseEffects {
    static func play(_ effects: [MeeshyTimelineFriseEffect], calls: MeeshyTimelineFriseHostCalls) {
        for effect in effects {
            switch effect {
            case .editing(let part, let isEditing): calls.onEditingChanged?(part, isEditing)
            case .select(let id, let time): calls.onSelect(id, time)
            case .seek(let time): calls.onSeek?(time)
            case .commit(let id, let range, let part): calls.onWindowCommit?(id, range, part)
            case .keyframe(let id, let key): calls.onKeyframe?(id, key)
            case .announce(let id, let range): calls.announce(id, range)
            case .haptic(.light): HapticFeedback.light()
            }
        }
    }

    /// La nouvelle fenêtre, dite au lecteur d'écran.
    static func post(_ text: String) {
        #if canImport(UIKit) && os(iOS)
        UIAccessibility.post(notification: .announcement, argument: text)
        #endif
    }
}

private struct MeeshyTimelineFriseForcedHeldKey: EnvironmentKey {
    static let defaultValue: MeeshyTimelineFriseHeld? = nil
}

private struct MeeshyTimelineFriseForcedViewportKey: EnvironmentKey {
    static let defaultValue: MeeshyTimelineFriseViewport? = nil
}

extension EnvironmentValues {
    /// Fige un geste en cours (barre aimantée, poignée tenue) : les tuiles du catalogue, rien d'autre.
    var meeshyTimelineFriseForcedHeld: MeeshyTimelineFriseHeld? {
        get { self[MeeshyTimelineFriseForcedHeldKey.self] }
        set { self[MeeshyTimelineFriseForcedHeldKey.self] = newValue }
    }

    /// Fige une fenêtre visible zoomée : l'état « zoomée » du catalogue.
    var meeshyTimelineFriseForcedViewport: MeeshyTimelineFriseViewport? {
        get { self[MeeshyTimelineFriseForcedViewportKey.self] }
        set { self[MeeshyTimelineFriseForcedViewportKey.self] = newValue }
    }
}

/// Le clavier (iOS 17+, iPad) d'une partie de la frise : ← → (Maj : 0,1 s),
/// Début et Fin, Entrée ou Espace, `+` `−` `0`. Le focus ne s'offre pas à une
/// frise désactivée ; l'anneau est dessiné par la partie visée.
struct MeeshyTimelineFriseKeys: ViewModifier {
    let target: MeeshyTimelineFriseFocus
    let isEnabled: Bool
    let focus: FocusState<MeeshyTimelineFriseFocus?>.Binding
    let onCommand: (MeeshyTimelineFriseCommand) -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content
                .focusable(isEnabled, interactions: .edit)
                .focused(focus, equals: target)
                .focusEffectDisabled()
                .onKeyPress(keys: Self.keys) { press in
                    guard let command = Self.command(for: press) else { return .ignored }
                    onCommand(command)
                    return .handled
                }
        } else {
            content
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    private static var keys: Set<KeyEquivalent> {
        [.leftArrow, .rightArrow, .home, .end, .return, .space, "+", "=", "-", "0"]
    }

    @available(iOS 17.0, macOS 14.0, *)
    private static func command(for press: KeyPress) -> MeeshyTimelineFriseCommand? {
        let isFine = press.modifiers.contains(.shift)
        switch press.key {
        case .leftArrow: return isFine ? .fineLeft : .arrowLeft
        case .rightArrow: return isFine ? .fineRight : .arrowRight
        case .home: return .home
        case .end: return .end
        case .return, .space: return .choose
        case "+", "=": return .zoomIn
        case "-": return .zoomOut
        case "0": return .zoomReset
        default: return nil
        }
    }
}
