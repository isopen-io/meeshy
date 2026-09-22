import SwiftUI
import MeeshySDK

/// **Ce qu'on voit quand un éphémère est détruit sous les yeux du lecteur**
/// (#7467).
///
/// > « sa destruction doit avoir un effet visuel si on est dans la conversation
/// > au moment de la destruction. »
///
/// ## Pourquoi ce n'est pas un ornement
///
/// Un message qui disparaît d'une liste sans transition ne se lit pas comme une
/// destruction : il se lit comme un SAUT. La liste se réorganise d'un coup, et
/// le lecteur croit avoir raté un défilement — il cherche le message plus haut.
/// L'effet est ce qui rend l'événement COMPRÉHENSIBLE, et il a donc le rang
/// d'une information, pas d'une décoration.
///
/// ## La combustion, puis le repli
///
/// La bulle se consume — elle rétrécit, se dore et s'efface — pendant
/// `EphemeralBurn.fullDuration`. Le RETRAIT de la ligne, lui, appartient à
/// l'hôte : il attend la même durée, puis retire, et les voisins se resserrent
/// par l'animation de la liste. Les deux durées viennent de la même constante,
/// sans quoi la ligne disparaîtrait au milieu de sa combustion ou laisserait un
/// trou après elle.
///
/// ## Sous « Réduire les animations »
///
/// Le message perd son MOUVEMENT, pas son annonce : ni rétrécissement ni
/// rotation, un simple fondu, plus court — un fondu long sans mouvement se lit
/// comme une lenteur. C'est la règle 6 des effets de message du dépôt,
/// appliquée à une disparition.
public struct EphemeralBurnEffect: ViewModifier {

    /// La destruction est-elle EN COURS pour ce message ?
    public let isBurning: Bool

    /// Lu ICI plutôt que passé par chaque hôte : les cinq peaux poseraient
    /// sinon la même ligne, et l'une d'elles finirait par l'oublier. Un
    /// `ViewModifier` a droit aux property wrappers — c'est ce qui permet à
    /// `FocalRow` de rester sans `@State` (contrainte dure §WS-4) tout en
    /// honorant le réglage.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(isBurning: Bool) {
        self.isBurning = isBurning
    }

    public func body(content: Content) -> some View {
        content
            .opacity(isBurning ? 0 : 1)
            .scaleEffect(scale, anchor: .center)
            .blur(radius: isBurning && !reduceMotion ? 6 : 0)
            .overlay { emberGlow }
            .animation(
                .easeOut(duration: EphemeralBurn.duration(reduceMotion: reduceMotion)),
                value: isBurning
            )
            .allowsHitTesting(!isBurning)
            .accessibilityHidden(isBurning)
    }

    private var scale: CGFloat {
        guard isBurning, !reduceMotion else { return 1 }
        return 0.86
    }

    /// La braise — une teinte chaude qui monte puis s'éteint avec la bulle.
    /// Absente sous « Réduire les animations » : une lueur qui apparaît est
    /// elle aussi du mouvement.
    @ViewBuilder
    private var emberGlow: some View {
        if isBurning && !reduceMotion {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.warning.opacity(0.55), MeeshyColors.error.opacity(0.35)],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                )
                .blendMode(.plusLighter)
                .opacity(0.9)
                .allowsHitTesting(false)
                .transition(.opacity)
        }
    }
}

public extension View {

    /// Applique la combustion d'un éphémère détruit sous les yeux du lecteur.
    ///
    /// **Un message qui ne brûle pas ne paie rien** : le modificateur est posé
    /// sur les cinq peaux, et `isBurning == false` laisse la vue intacte —
    /// même discipline que « plan vide ⇒ vue intacte » des effets de message.
    func ephemeralBurn(isBurning: Bool) -> some View {
        modifier(EphemeralBurnEffect(isBurning: isBurning))
    }
}
