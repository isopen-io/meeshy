import SwiftUI

/// **Tout contrôle du composer touché REBONDIT** (#9753, #9754 — règle d'écran
/// du porteur) : il s'enfonce au contact et dépasse au relâché avant de se
/// poser. Sous « réduire les animations », le ressort devient un fondu : le
/// contrôle répond toujours, sans bouger.
nonisolated enum ComposerControlBounce {
    static let pressScale: CGFloat = 0.86
    static let reducedPressOpacity: Double = 0.6

    static func scale(pressed: Bool, reduceMotion: Bool) -> CGFloat {
        pressed && !reduceMotion ? pressScale : 1
    }

    static func opacity(pressed: Bool, reduceMotion: Bool) -> Double {
        pressed && reduceMotion ? reducedPressOpacity : 1
    }
}

/// Le style qui JOUE le rebond. `configuration.isPressed` est tenu par le
/// système : il se relâche quand un autre geste prend la main.
struct ComposerBounceButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        ComposerBounceBody(label: configuration.label, pressed: configuration.isPressed)
    }
}

private struct ComposerBounceBody<Label: View>: View {
    let label: Label
    let pressed: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        label
            .scaleEffect(ComposerControlBounce.scale(pressed: pressed, reduceMotion: reduceMotion))
            .opacity(ComposerControlBounce.opacity(pressed: pressed, reduceMotion: reduceMotion))
            .animation(reduceMotion ? .easeOut(duration: 0.12)
                                    : (pressed ? .spring(response: 0.18, dampingFraction: 0.8)
                                               : .spring(response: 0.34, dampingFraction: 0.5)),
                       value: pressed)
    }
}
