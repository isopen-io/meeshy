import SwiftUI
import MeeshySDK
import MeeshyUI

// L'effet APPLIQUÉ à la ligne 2 d'une rangée de conversation (#16975) — le
// RENDU de `ConversationPreview.effect`, que le composeur (SDK) décrit sous la
// même loi d'énergie que le web : un voile et un fini FIGÉS, une entrée jouée
// UNE fois. Une liste ne fait jamais tourner d'animation en boucle ni
// n'émet de particules.

/// Le rendu FIGÉ du corps de la ligne. `pulse` et `sparkle` se peignent sur
/// l'icône (`ConversationPreviewLine.glyphText`), le corps reste nu.
nonisolated enum ConversationPreviewFinishStyle: Equatable, Sendable {
    case plain
    case veiled
    case glow
    case rainbow

    init(effect: ConversationPreviewEffect?) {
        guard let effect else { self = .plain; return }
        if effect.veil { self = .veiled; return }
        switch effect.finish {
        case .glow?: self = .glow
        case .rainbow?: self = .rainbow
        case .pulse?, .sparkle?, .none: self = .plain
        }
    }

    /// Un dégradé STATIQUE tiré de la palette de lecture de l'arc-en-ciel du
    /// fil (`RainbowLetters`, ≥ 4,5:1 contre le fond de chaque thème).
    static func rainbowGradient(isDark: Bool) -> LinearGradient {
        LinearGradient(
            colors: RainbowLetters.palette(isDark: isDark),
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}

/// QUAND l'entrée se joue — décision PURE, app-side (SDK Purity).
///
/// Seulement quand le dernier message CHANGE (nouvel id) sur une ligne
/// visible : jamais au premier affichage (`previousId == nil`), jamais au
/// défilement ni au recyclage (la vue recréée n'a pas d'id précédent), jamais
/// sous « réduire les animations » ni en économie d'énergie.
nonisolated enum ConversationPreviewEntrancePolicy {
    static func shouldPlay(
        previousId: String?, currentId: String?, isVisible: Bool, reduceMotion: Bool, lowPower: Bool
    ) -> Bool {
        guard let previousId, let currentId, !currentId.isEmpty, previousId != currentId else { return false }
        return isVisible && !reduceMotion && !lowPower
    }

    /// Durée de chaque entrée — sous `ConversationPreviewEffect.entranceMaxMilliseconds`.
    static func milliseconds(of entrance: ConversationPreviewEffect.Entrance) -> Int {
        switch entrance {
        case .shake: return 360
        case .pop: return 300
        }
    }
}

/// Joue l'entrée de la ligne à l'arrivée d'un nouveau message. État minimal :
/// la visibilité, le compteur d'animation et l'entrée en cours. Aucun
/// singleton OBSERVÉ : le réglage « réduire les animations » de l'app est lu
/// au moment de jouer, comme l'économie d'énergie, jamais souscrit.
struct ConversationPreviewEntranceModifier: ViewModifier {
    let messageId: String?
    let entrance: ConversationPreviewEffect.Entrance?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isVisible = false
    @State private var progress: CGFloat = 0
    @State private var playing: ConversationPreviewEffect.Entrance?

    func body(content: Content) -> some View {
        content
            .modifier(ConversationPreviewEntranceEffect(entrance: playing, animatableData: progress))
            .onAppear { isVisible = true }
            .onDisappear { isVisible = false }
            .adaptiveOnChange(of: messageId) { previous, current in
                guard let entrance,
                      ConversationPreviewEntrancePolicy.shouldPlay(
                        previousId: previous,
                        currentId: current,
                        isVisible: isVisible,
                        reduceMotion: MeeshyMotion.shouldReduce(
                            system: reduceMotion,
                            userForced: MeeshyAccessibilityPreferences.shared.reduceMotion
                        ),
                        lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled
                      )
                else { return }
                playing = entrance
                let duration = Double(ConversationPreviewEntrancePolicy.milliseconds(of: entrance)) / 1000
                let curve: Animation = entrance == .shake ? .linear(duration: duration) : .easeInOut(duration: duration)
                withAnimation(curve) { progress += 1 }
            }
    }
}

/// Transformation seule, identité à chaque entier de `animatableData` :
/// `shake` = trois oscillations de ±3 pt, `pop` = 1 → 1,06 → 1 ancré à gauche.
struct ConversationPreviewEntranceEffect: GeometryEffect {
    var entrance: ConversationPreviewEffect.Entrance?
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        switch entrance {
        case .shake?:
            return ProjectionTransform(CGAffineTransform(translationX: 3 * sin(animatableData * .pi * 6), y: 0))
        case .pop?:
            let scale = 1 + 0.06 * abs(sin(animatableData * .pi))
            let anchor = size.height / 2
            return ProjectionTransform(
                CGAffineTransform(translationX: 0, y: anchor).scaledBy(x: scale, y: scale).translatedBy(x: 0, y: -anchor)
            )
        case .none:
            return ProjectionTransform(.identity)
        }
    }
}
