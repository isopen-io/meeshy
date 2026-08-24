import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Appearance Effects (one-shot, rejoués à CHAQUE venue à l'écran)

/// Laisse passer une frame avant d'animer.
///
/// Un effet d'apparition se rejoue à chaque affichage, donc `onAppear` peut
/// retrouver la phase déjà à `1` (vue conservée en mémoire, conversation
/// rouverte). La remettre à `0` puis l'animer vers `1` dans le MÊME tour
/// synchrone ne produit rien : SwiftUI ne voit qu'un état net inchangé, sans
/// frame de départ à interpoler. Ce délai d'une frame est ce qui rend le rejeu
/// possible ; sans lui, seule la toute première apparition serait animée.
private let appearanceFrameDelay = Duration.milliseconds(16)

/// Oscillation horizontale réelle.
///
/// Un `.offset(x: sin(phase * .pi * 4) * 8)` animé par `phase: 0 → 1` NE SECOUE
/// RIEN : SwiftUI n'anime pas `phase`, il interpole la VALEUR PRODUITE entre son
/// état initial et son état final. Or `sin(0) == sin(4π) == 0` — le décalage part
/// de 0 et arrive à 0, et l'interpolation entre les deux est plate. C'est un
/// `GeometryEffect` qui donne la sinusoïde : SwiftUI interpole `animatableData`
/// lui-même et rappelle `effectValue` à chaque pas, donc la courbe est
/// réellement parcourue.
struct ShakeGeometryEffect: GeometryEffect {
    var travel: CGFloat = 8
    var shakes: CGFloat = 4
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(
            CGAffineTransform(translationX: travel * sin(animatableData * .pi * shakes), y: 0)
        )
    }
}

/// Toutes les apparitions suivent la même mécanique : une phase `0 → 1` remise
/// à zéro puis relancée à chaque `onAppear`, dont chaque effet DÉRIVE son rendu.
/// Animer une phase unique plutôt que plusieurs propriétés indépendantes est ce
/// qui rend le rejeu fiable — il n'y a qu'un état à réarmer.
private struct AppearancePhaseDriver: ViewModifier {
    let active: Bool
    let animation: Animation
    @Binding var phase: CGFloat

    func body(content: Content) -> some View {
        content.onAppear {
            guard active else { return }
            phase = 0
            Task { @MainActor in
                try? await Task.sleep(for: appearanceFrameDelay)
                withAnimation(animation) { phase = 1 }
            }
        }
    }
}

private extension View {
    func replayingAppearance(active: Bool, animation: Animation, phase: Binding<CGFloat>) -> some View {
        modifier(AppearancePhaseDriver(active: active, animation: animation, phase: phase))
    }
}

struct ShakeEffect: ViewModifier {
    let active: Bool
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .modifier(ShakeGeometryEffect(animatableData: active ? phase : 0))
            .replayingAppearance(active: active, animation: .easeOut(duration: 0.6), phase: $phase)
    }
}

struct ZoomEffect: ViewModifier {
    let active: Bool
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? 0.3 + 0.7 * phase : 1)
            .replayingAppearance(active: active,
                                 animation: .spring(response: 0.5, dampingFraction: 0.6),
                                 phase: $phase)
    }
}

struct ExplodeEffect: ViewModifier {
    let active: Bool
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? 0.1 + 0.9 * phase : 1)
            .opacity(active ? Double(min(1, phase * 3)) : 1)
            .replayingAppearance(active: active,
                                 animation: .spring(response: 0.4, dampingFraction: 0.55),
                                 phase: $phase)
    }
}

struct WaooEffect: ViewModifier {
    let active: Bool
    @State private var phase: CGFloat = 0

    /// Le halo enfle puis retombe : il culmine à mi-parcours, contrairement à
    /// l'échelle qui rejoint son repos. Le ressort dépasse `1`, donc la sinusoïde
    /// repasse sous zéro — d'où le plancher, une opacité négative n'ayant pas de
    /// sens.
    private var glowOpacity: Double { active ? max(0, Double(sin(phase * .pi))) * 0.6 : 0 }

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? 0.5 + 0.5 * phase : 1)
            .shadow(color: .yellow.opacity(glowOpacity), radius: 20)
            .replayingAppearance(active: active,
                                 animation: .spring(response: 0.5, dampingFraction: 0.45),
                                 phase: $phase)
    }
}

// MARK: - Particle Overlay Effects (one-shot)

/// Une particule décrite en coordonnées RELATIVES, figée à la construction.
///
/// L'implémentation précédente stockait des positions absolues dans un `@State`
/// vide, le remplissait depuis `onAppear`, puis le re-mutait pour animer — dans
/// le même tour de boucle. SwiftUI n'ayant jamais rendu les positions de départ,
/// il n'avait rien à interpoler et les particules pouvaient sauter directement à
/// l'arrivée.
///
/// Ici les descripteurs sont immuables et tirés une seule fois à l'init ; seule
/// une progression `0 → 1` est animée, et la position se DÉDUIT d'elle dans le
/// `body`. La première frame existe donc toujours (progress = 0), et l'animation
/// ne dépend plus d'un ordonnancement de runloop.
private struct ParticleSeed: Identifiable {
    let id = UUID()
    /// Position de départ en fraction de la largeur (0…1) — indépendante de la
    /// taille, donc résistante à un `GeometryReader` qui se stabilise tard.
    let startXFraction: CGFloat
    let driftX: CGFloat
    let color: Color
    let size: CGFloat
    let rotation: Double
    let angle: Double
    let distance: CGFloat
}

struct ConfettiOverlay: View {
    @State private var seeds: [ParticleSeed]
    @State private var progress: CGFloat = 0
    @State private var opacity: Double = 1

    init() {
        let colors: [Color] = [.red, .blue, .green, .yellow, .purple, .orange, .pink]
        _seeds = State(initialValue: (0..<30).map { _ in
            ParticleSeed(
                startXFraction: CGFloat.random(in: 0...1),
                driftX: CGFloat.random(in: -30...30),
                color: colors.randomElement() ?? .blue,
                size: CGFloat.random(in: 4...8),
                rotation: Double.random(in: 0...360),
                angle: 0,
                distance: 0
            )
        })
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(seeds) { seed in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(seed.color)
                        .frame(width: seed.size, height: seed.size * 0.6)
                        .rotationEffect(.degrees(seed.rotation))
                        .position(
                            x: seed.startXFraction * geo.size.width + seed.driftX * progress,
                            y: -10 + progress * (geo.size.height + 30)
                        )
                }
            }
        }
        .opacity(opacity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { replay() }
    }

    private func replay() {
        progress = 0
        opacity = 1
        Task { @MainActor in
            try? await Task.sleep(for: appearanceFrameDelay)
            withAnimation(.easeIn(duration: 1.5)) { progress = 1 }
            withAnimation(.easeIn(duration: 0.5).delay(1.2)) { opacity = 0 }
        }
    }
}

struct FireworksOverlay: View {
    @State private var seeds: [ParticleSeed]
    @State private var progress: CGFloat = 0
    @State private var opacity: Double = 1

    init() {
        // Brand-signature sparks tokenized to the Indigo palette (SSOT) so a brand
        // recolor propagates here; .yellow/.orange/.white stay decorative highlights.
        let colors: [Color] = [MeeshyColors.indigo500, MeeshyColors.indigo400, .yellow, .orange, .white]
        _seeds = State(initialValue: (0..<20).map { i in
            ParticleSeed(
                startXFraction: 0.5,
                driftX: 0,
                color: colors.randomElement() ?? .white,
                size: 4,
                rotation: 0,
                angle: Double(i) * (360.0 / 20.0),
                distance: CGFloat.random(in: 40...80)
            )
        })
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(seeds) { seed in
                    let rad = seed.angle * .pi / 180
                    Circle()
                        .fill(seed.color)
                        .frame(width: seed.size, height: seed.size)
                        .position(
                            x: geo.size.width / 2 + cos(rad) * seed.distance * progress,
                            y: geo.size.height / 2 + sin(rad) * seed.distance * progress
                        )
                }
            }
        }
        .opacity(opacity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { replay() }
    }

    private func replay() {
        progress = 0
        opacity = 1
        Task { @MainActor in
            try? await Task.sleep(for: appearanceFrameDelay)
            withAnimation(.easeOut(duration: 0.8)) { progress = 1 }
            withAnimation(.easeIn(duration: 0.4).delay(0.6)) { opacity = 0 }
        }
    }
}

struct ExplodeOverlay: View {
    @State private var scale: CGFloat = 0.3
    @State private var opacity: Double = 1

    var body: some View {
        Circle()
            .fill(
                RadialGradient(colors: [MeeshyColors.indigo500.opacity(0.4), .clear], center: .center, startRadius: 0, endRadius: 60)
            )
            .scaleEffect(scale)
            .opacity(opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear { replay() }
    }

    private func replay() {
        scale = 0.3
        opacity = 1
        Task { @MainActor in
            try? await Task.sleep(for: appearanceFrameDelay)
            withAnimation(.easeOut(duration: 0.5)) { scale = 2.5 }
            withAnimation(.easeIn(duration: 0.3).delay(0.3)) { opacity = 0 }
        }
    }
}

struct WaooOverlay: View {
    @State private var scale: CGFloat = 0.5
    @State private var opacity: Double = 1

    var body: some View {
        Image(systemName: "star.fill")
            .font(.system(size: 30))
            .foregroundStyle(
                LinearGradient(colors: [.yellow, .orange], startPoint: .top, endPoint: .bottom)
            )
            .scaleEffect(scale)
            .opacity(opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear { replay() }
    }

    private func replay() {
        scale = 0.5
        opacity = 1
        Task { @MainActor in
            try? await Task.sleep(for: appearanceFrameDelay)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.4)) { scale = 1.5 }
            withAnimation(.easeOut(duration: 0.3).delay(0.5)) {
                scale = 0
                opacity = 0
            }
        }
    }
}

// MARK: - Persistent Effects (continuous looping)

/// `animated: false` (Réduire les animations) rend l'effet FIXE au lieu de le
/// supprimer : le message garde son halo, il perd sa respiration.
struct GlowEffect: ViewModifier {
    let active: Bool
    let intensity: Double
    let animated: Bool
    @State private var glowing = false

    func body(content: Content) -> some View {
        content
            .shadow(
                color: MeeshyColors.indigo500.opacity(active ? (glowing ? intensity : intensity * 0.3) : 0),
                radius: active ? (glowing ? 12 : 4) : 0
            )
            .onAppear {
                guard active else { return }
                guard animated else {
                    glowing = true   // halo constant, pleine intensité, sans pulsation
                    return
                }
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    glowing = true
                }
            }
    }
}

struct PulseEffect: ViewModifier {
    let active: Bool
    @State private var pulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? (pulsing ? 1.02 : 1.0) : 1.0)
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                    pulsing = true
                }
            }
    }
}

/// **Aurore** — le successeur du cadre arc-en-ciel (directive 2026-08-24 :
/// « quelque chose de visuellement plus esthétique »).
///
/// Ce que faisait l'ancien rendu, et pourquoi il avait l'air d'un autocollant :
/// un trait dur de 2 pt en rouge/vert/bleu saturés, étranger à la charte ; un
/// `cornerRadius` de 16 EN DUR, donc un cadre qui flottait autour d'un média
/// arrondi autrement ; un `AngularGradient` dont la dernière couleur retombait
/// sur la première en laissant une COUTURE ; et un `hueRotation` de 360° en 3 s
/// qui traversait tout le cercle chromatique — un clignotement, et surtout la
/// DÉNATURATION des couleurs choisies par l'auteur (`rainbowColors`, décodé et
/// testé depuis toujours, mais que le rendu n'a jamais lu : une lecture morte).
///
/// Ce qui le remplace :
/// - **deux couches** — un halo flouté large qui pose la lueur, un liseré fin
///   qui la définit. Une aurore enveloppe ; un cadre encercle.
/// - **un spectre de MÊME clarté**, ancré sur l'indigo de la marque et passant
///   par `success` et `warning` : les teintes se succèdent sans qu'aucune ne
///   crie plus fort que les autres.
/// - **une rotation du DÉGRADÉ**, pas de la teinte : le spectre glisse autour
///   de la forme, et le bleu que l'auteur a demandé reste bleu.
/// - **le rayon en paramètre**, pour que le liseré épouse ce qu'il entoure.
///
/// `animated == false` (Réduire les animations) : le dégradé se fige. C'est ce
/// que veut la règle 6 — le message perd son mouvement, pas son intention.
struct RainbowEffect: ViewModifier {
    let active: Bool
    let animated: Bool
    /// Couleurs choisies par l'auteur (`MessageEffects.rainbowColors`).
    var colors: [String]? = nil
    /// Rayon de la forme entourée. Défaut aligné sur la bulle et son média.
    var cornerRadius: CGFloat = 18

    @State private var rotation: Double = 0

    /// Le spectre de la maison — sept arrêts de clarté homogène, refermés sur
    /// leur première couleur. Trois d'entre eux sont déjà des tokens nommés
    /// (`indigo400`, `success`, `warning`) : l'effet n'invente pas sa palette,
    /// il étend celle de la charte.
    static let houseSpectrum = ["#818CF8", "#E879F9", "#FB7185", "#FBBF24", "#34D399", "#38BDF8", "#818CF8"]

    /// Spectre effectivement peint. Boucle TOUJOURS sur sa première couleur :
    /// un `AngularGradient` ouvert montre la couture de son raccord.
    nonisolated static func spectrum(from custom: [String]?) -> [String] {
        guard let custom, !custom.isEmpty else { return houseSpectrum }
        return custom + [custom[0]]
    }

    private var gradient: AngularGradient {
        AngularGradient(
            colors: Self.spectrum(from: colors).map { Color(hex: $0) },
            center: .center,
            angle: .degrees(rotation)
        )
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    }

    func body(content: Content) -> some View {
        content
            .overlay {
                if active {
                    ZStack {
                        shape.stroke(gradient, lineWidth: 5).blur(radius: 6).opacity(0.35)
                        shape.stroke(gradient, lineWidth: 1).opacity(0.75)
                    }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
            }
            .onAppear {
                guard active, animated else { return }
                withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            }
    }
}

struct SparkleEffect: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        content
            .overlay {
                if active {
                    TimelineView(.animation(minimumInterval: 0.1)) { timeline in
                        Canvas { context, size in
                            let time = timeline.date.timeIntervalSinceReferenceDate
                            for i in 0..<8 {
                                let phase = time + Double(i) * 0.5
                                let x = (sin(phase * 1.3 + Double(i)) * 0.4 + 0.5) * size.width
                                let y = (cos(phase * 0.9 + Double(i) * 0.7) * 0.4 + 0.5) * size.height
                                let sparkleSize = (sin(phase * 2 + Double(i)) * 0.5 + 0.5) * 6 + 2
                                let sparkleOpacity = sin(phase * 2 + Double(i)) * 0.3 + 0.4

                                context.opacity = sparkleOpacity
                                let rect = CGRect(x: x - sparkleSize / 2, y: y - sparkleSize / 2, width: sparkleSize, height: sparkleSize)
                                context.fill(Path(ellipseIn: rect), with: .color(.white))
                            }
                        }
                    }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
            }
    }
}

// MARK: - Orchestration

/// Applique les effets d'un message : une exécution par affichage à l'écran.
///
/// L'implémentation précédente exposait un `hasPlayedAppearance: Bool` que
/// l'appelant basculait à `true` dans un `.onAppear` frère — donc dans la MÊME
/// passe de mise à jour que les `.onAppear` internes qui démarrent les
/// animations. Le changement d'état re-rendait immédiatement la vue avec
/// `active == false`, remettait chaque modifier à l'identité et retirait les
/// overlays de particules AVANT qu'une frame animée n'ait été produite : en
/// conversation, aucun effet d'apparition n'était jamais visible.
///
/// Il n'y a désormais AUCUNE mémoire de lecture, ni ici ni ailleurs. Un effet
/// se déclenche à l'affichage, comme le flou d'un message protégé se déclenche
/// à l'ouverture — et non à la réception, qui est l'horloge du compteur
/// éphémère. Revenir sur la conversation, ou refaire défiler la bulle à
/// l'écran, rejoue l'effet ; chaque déclenchement s'exécute une fois et ne
/// boucle pas.
struct MessageEffectsModifier: ViewModifier {
    let effects: MessageEffects

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        let plan = effects.playbackPlan(reduceMotion: reduceMotion)

        // L'écrasante majorité des messages n'a aucun effet : ils ne doivent pas
        // payer huit ViewModifier inertes par cellule de liste.
        if plan.isEmpty {
            content
        } else {
            content
                .modifier(ShakeEffect(active: plan.appearance.contains(.shake)))
                .modifier(ZoomEffect(active: plan.appearance.contains(.zoom)))
                .modifier(ExplodeEffect(active: plan.appearance.contains(.explode)))
                .modifier(WaooEffect(active: plan.appearance.contains(.waoo)))
                .modifier(GlowEffect(active: plan.persistent.contains(.glow),
                                     intensity: effects.glowIntensity ?? 0.5,
                                     animated: plan.animatesPersistent))
                .modifier(PulseEffect(active: plan.persistent.contains(.pulse)))
                .modifier(RainbowEffect(active: plan.persistent.contains(.rainbow),
                                        animated: plan.animatesPersistent,
                                        colors: effects.rainbowColors))
                .modifier(SparkleEffect(active: plan.persistent.contains(.sparkle)))
                .overlay {
                    if plan.appearance.contains(.confetti) { ConfettiOverlay() }
                    if plan.appearance.contains(.fireworks) { FireworksOverlay() }
                    if plan.appearance.contains(.explode) { ExplodeOverlay() }
                    if plan.appearance.contains(.waoo) { WaooOverlay() }
                }
        }
    }
}

// MARK: - Convenience Extension

extension View {
    /// Applique les effets du message. Les effets d'apparition rejouent à
    /// chaque venue à l'écran — il n'y a rien à mémoriser.
    func messageEffects(_ effects: MessageEffects) -> some View {
        modifier(MessageEffectsModifier(effects: effects))
    }
}
