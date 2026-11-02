import SwiftUI
import MeeshyUI

/// LE REBOND DU JEU (#9564, amendement n° 2) — UNE courbe, déclarée une fois, pour tout ce qui se touche dans
/// Progression : la carte d'un concept, un badge, un trophée, une pastille, une ligne de donnée, le blason et le
/// compteur de l'en-tête. L'élément S'ENFONCE au contact, DÉPASSE au relâché, puis se pose — un ressort, jamais
/// une simple opacité. Sous « réduire les animations », le ressort devient un fondu.
///
/// Le jeton est une donnée : les vues ne recopient ni l'échelle ni la raideur. La modale de précisions fait
/// ENTRER son emblème avec le MÊME ressort (`GameMotion.release`) — c'est ce qui lie le toucher à ce qu'il ouvre.
enum GameMotion {
    /// L'échelle au contact : l'élément s'enfonce.
    static let pressScale: CGFloat = 0.94
    /// L'échelle d'où l'emblème de la modale part avant de rebondir à sa taille.
    static let entranceScale: CGFloat = 0.6
    /// L'opacité au contact sous « réduire les animations » : un fondu, pas un mouvement.
    static let reducedPressOpacity: Double = 0.6

    /// L'enfoncement : bref et amorti, il suit le doigt.
    static let press = Animation.spring(response: 0.18, dampingFraction: 0.82)
    /// Le relâché : un ressort sous-amorti — il DÉPASSE la taille de repos avant de s'y poser.
    static let release = Animation.spring(response: 0.36, dampingFraction: 0.52)
    /// Le fondu qui remplace le ressort sous « réduire les animations ».
    static let reduced = Animation.easeOut(duration: GameTimeline.reducedDuration)

    static func animation(pressed: Bool, reduceMotion: Bool) -> Animation {
        if reduceMotion { return reduced }
        return pressed ? press : release
    }

    static func scale(pressed: Bool, reduceMotion: Bool) -> CGFloat {
        pressed && !reduceMotion ? pressScale : 1
    }

    static func opacity(pressed: Bool, reduceMotion: Bool) -> Double {
        pressed && reduceMotion ? reducedPressOpacity : 1
    }
}

/// Le style de bouton qui JOUE le rebond. Un `ButtonStyle`, et non le `bounceOnTap()` du design system : celui-ci
/// suit le doigt par un `DragGesture(minimumDistance: 0)` simultané, qui dispute le geste au défilement et peut
/// rester enfoncé quand la liste part sous le doigt. `configuration.isPressed` est tenu par le système — il se
/// relâche quand le défilement prend la main. C'est le SEUL style de bouton du jeu.
struct GameBounceButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        GameBounceBody(label: configuration.label, pressed: configuration.isPressed)
    }
}

private struct GameBounceBody<Label: View>: View {
    let label: Label
    let pressed: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        label
            .scaleEffect(GameMotion.scale(pressed: pressed, reduceMotion: reduceMotion))
            .opacity(GameMotion.opacity(pressed: pressed, reduceMotion: reduceMotion))
            .animation(GameMotion.animation(pressed: pressed, reduceMotion: reduceMotion), value: pressed)
    }
}

/// UN ÉLÉMENT QUI SE TOUCHE : il rebondit, donne un retour haptique léger, puis fait ce qu'on lui demande —
/// ouvrir la fiche, ou les précisions de CET élément. Un vrai `Button` : VoiceOver, le clavier et le pointeur le
/// reconnaissent, et aucun geste séquencé ne peut lui voler son toucher.
struct GameBounceButton<Label: View>: View {
    let action: () -> Void
    @ViewBuilder let label: () -> Label

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            label()
        }
        .buttonStyle(GameBounceButtonStyle())
    }
}
