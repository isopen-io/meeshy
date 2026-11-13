import SwiftUI
import MeeshySDK

/// **Ce qu'on voit quand un éphémère est détruit sous les yeux du lecteur**
/// (#7467, puis #17938).
///
/// > « sa destruction doit avoir un effet visuel si on est dans la conversation
/// > au moment de la destruction. » (#7467)
/// > « un vrai effet en utilisant la carte graphique si disponible pour brûler
/// > les lettres ! faire disparaître comme des étincelles et les flammes autour
/// > et un vent qui fait disparaître à gauche ou à droite selon la direction de
/// > mouvement de l'appareil » (directive porteur 2026-11-13)
///
/// ## Pourquoi ce n'est pas un ornement
///
/// Un message qui disparaît d'une liste sans transition ne se lit pas comme une
/// destruction : il se lit comme un SAUT. L'effet est ce qui rend l'événement
/// COMPRÉHENSIBLE, et il a donc le rang d'une information, pas d'une décoration.
///
/// ## La combustion, puis le repli
///
/// Sur iOS 17+, la bulle BRÛLE : le shader `meeshyEphemeralBurn`
/// (`EphemeralBurnLayer`) fait avancer un front depuis le bord d'où vient le
/// vent, lettre par lettre, avec une lisière de braise, des flammes et des
/// étincelles que le vent emporte — pendant `EphemeralBurn.fullDuration`. Le
/// RETRAIT de la ligne appartient à l'hôte : il attend la même durée, puis
/// retire, et les voisins se resserrent par l'animation de la liste.
///
/// Le SENS du front est figé à l'allumage (`EphemeralBurnIgnition`) ; la
/// DÉRIVE suit le vent de l'appareil en direct, par l'atome `EphemeralBurnWind`
/// que le fil pose dans l'environnement — sans lui, le vent par défaut du côté
/// de la bulle (`EphemeralBurnLaw`).
///
/// ## Ce qui reste intact
///
/// **Un message qui ne brûle pas ne paie rien** : hors combustion, le contenu
/// est rendu tel quel, sans aucun modificateur. La structure change à
/// l'allumage — et c'est voulu : les milliers de bulles d'un fil ne portent pas
/// un `visualEffect` inerte pour les quelques-unes qui brûleront.
///
/// ## iOS 16 et « Réduire les animations »
///
/// Le repli d'avant (`EphemeralBurnFallback`) : la bulle se dore, rétrécit et
/// s'efface ; sous Reduce Motion, un simple fondu, plus court.
public struct EphemeralBurnEffect: ViewModifier {

    /// La destruction est-elle EN COURS pour ce message ?
    public let isBurning: Bool

    /// De quel côté de l'écran la bulle vit : décide du vent par défaut, donc
    /// du bord d'où part le feu quand l'appareil ne bouge pas.
    public let side: EphemeralBurnSide

    /// Lu ICI plutôt que passé par chaque hôte : les cinq peaux poseraient
    /// sinon la même ligne, et l'une d'elles finirait par l'oublier. Un
    /// `ViewModifier` a droit aux property wrappers — c'est ce qui permet à
    /// `FocalRow` de rester sans `@State` (contrainte dure §WS-4) tout en
    /// honorant le réglage.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.ephemeralBurnWind) private var wind

    @State private var progress: Double = 0
    @State private var ignition: EphemeralBurnIgnition?

    public init(isBurning: Bool, side: EphemeralBurnSide = .theirs) {
        self.isBurning = isBurning
        self.side = side
    }

    private var usesShader: Bool { EphemeralBurnShaders.usesMetal && !reduceMotion }

    public func body(content: Content) -> some View {
        Group {
            if usesShader {
                shaderPath(content)
            } else {
                content.modifier(EphemeralBurnFallback(isBurning: isBurning, reduceMotion: reduceMotion))
            }
        }
        .allowsHitTesting(!isBurning)
        .accessibilityHidden(isBurning)
        .onAppear { sync(burning: isBurning) }
        .adaptiveOnChange(of: isBurning) { _, now in sync(burning: now) }
    }

    @ViewBuilder
    private func shaderPath(_ content: Content) -> some View {
        if #available(iOS 17.0, macOS 14.0, *), isBurning, let ignition {
            burning(content, ignition: ignition)
                // Entre la fin de l'animation et le retrait de la ligne par
                // l'hôte, le shader est désactivé (`progress` ≥ 1) : sans
                // cette garde la bulle REVIENDRAIT une image, intacte.
                .opacity(progress >= 1 ? 0 : 1)
        } else {
            content
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    @ViewBuilder
    private func burning(_ content: Content, ignition: EphemeralBurnIgnition) -> some View {
        if let wind {
            EphemeralBurnDriftHost(wind: wind, side: side, progress: progress, ignition: ignition, content: content)
        } else {
            content.modifier(EphemeralBurnLayer(
                progress: progress,
                frontDirection: ignition.frontDirection,
                drift: EphemeralBurnLaw.wind(raw: nil, side: side),
                seed: ignition.seed
            ))
        }
    }

    /// L'allumage fige le sens du front et tire la graine, puis lance
    /// `progress` 0 → 1 UNE image plus tard : posée dans le même tour que le
    /// montage, l'animation n'aurait pas de frame de départ à interpoler
    /// (règle 3 des effets de message). L'extinction remet tout à zéro, sans
    /// animation : une relecture du magasin qui ne porte plus `isBurning` rend
    /// la vue intacte.
    private func sync(burning: Bool) {
        guard usesShader else { return }
        guard burning else {
            progress = 0
            ignition = nil
            return
        }
        guard ignition == nil else { return }
        ignition = .ignite(rawWind: wind?.raw, side: side, seed: Double.random(in: 0..<1))
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(16))
            guard isBurning, ignition != nil else { return }
            withAnimation(.linear(duration: EphemeralBurn.fullDuration)) { progress = 1 }
        }
    }
}

public extension View {

    /// Applique la combustion d'un éphémère détruit sous les yeux du lecteur.
    ///
    /// **Un message qui ne brûle pas ne paie rien** : le modificateur est posé
    /// sur les cinq peaux, et `isBurning == false` laisse la vue intacte —
    /// même discipline que « plan vide ⇒ vue intacte » des effets de message.
    /// `side` dit de quel côté de l'écran la bulle vit, pour le vent par défaut.
    func ephemeralBurn(isBurning: Bool, side: EphemeralBurnSide = .theirs) -> some View {
        modifier(EphemeralBurnEffect(isBurning: isBurning, side: side))
    }
}
