import SwiftUI

/// Joue les effets d'une interaction : l'hôte reçoit l'édition, la plage et la
/// tête ; le tic passe par `HapticFeedback`.
enum MeeshyTrimTrackEffects {
    static func play(
        _ effects: [MeeshyTrimTrackEffect],
        range: Binding<ClosedRange<Double>>,
        onSeek: ((Double) -> Void)?,
        onEditingChanged: ((MeeshyTrimTrackPart, Bool) -> Void)?
    ) {
        for effect in effects {
            switch effect {
            case .editing(let part, let isEditing): onEditingChanged?(part, isEditing)
            case .range(let next): range.wrappedValue = next
            case .seek(let time): onSeek?(time)
            case .haptic(.light): HapticFeedback.light()
            case .haptic(.medium): HapticFeedback.medium()
            }
        }
    }
}

private struct MeeshyTrimTrackForcesHeldKey: EnvironmentKey {
    static let defaultValue: MeeshyTrimTrackPart? = nil
}

private struct MeeshyTrimTrackForcesPreciseKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Fige une partie tenue : la tuile « pressée » du catalogue, rien d'autre.
    var meeshyTrimTrackForcesHeld: MeeshyTrimTrackPart? {
        get { self[MeeshyTrimTrackForcesHeldKey.self] }
        set { self[MeeshyTrimTrackForcesHeldKey.self] = newValue }
    }

    /// Fige la loupe ouverte sur la partie tenue : l'état « précision » du catalogue.
    var meeshyTrimTrackForcesPrecise: Bool {
        get { self[MeeshyTrimTrackForcesPreciseKey.self] }
        set { self[MeeshyTrimTrackForcesPreciseKey.self] = newValue }
    }
}

/// Le clavier (iOS 17+, iPad) d'une partie de la piste : flèches, Maj + flèches,
/// Page préc. / suiv., Début / Fin. Le focus ne s'offre pas à une piste
/// désactivée ; l'anneau est dessiné par la poignée.
struct MeeshyTrimTrackKeys: ViewModifier {
    let part: MeeshyTrimTrackPart
    let isEnabled: Bool
    let focus: FocusState<MeeshyTrimTrackPart?>.Binding
    let onCommand: (MeeshyTrimTrackCommand) -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content
                .focusable(isEnabled, interactions: .edit)
                .focused(focus, equals: part)
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
        [.leftArrow, .rightArrow, .pageUp, .pageDown, .home, .end]
    }

    @available(iOS 17.0, macOS 14.0, *)
    private static func command(for press: KeyPress) -> MeeshyTrimTrackCommand? {
        let isFine = press.modifiers.contains(.shift)
        switch press.key {
        case .leftArrow: return isFine ? .fineLeft : .arrowLeft
        case .rightArrow: return isFine ? .fineRight : .arrowRight
        case .pageUp: return .pageUp
        case .pageDown: return .pageDown
        case .home: return .home
        case .end: return .end
        default: return nil
        }
    }
}
