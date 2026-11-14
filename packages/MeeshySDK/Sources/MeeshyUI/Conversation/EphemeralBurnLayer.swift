import SwiftUI
import MeeshySDK

/// **Le calque qui brûle** — le shader Metal posé sur la bulle agrandie, animé
/// par `progress` (#17938). `Animatable` : c'est `animatableData` qui fait
/// parcourir la courbe quand l'hôte pose `progress = 1` dans une transaction ;
/// une valeur interpolée par SwiftUI, jamais calculée ici (règle 4 des effets).
///
/// Hors de son temps (`progress` ≤ 0 ou ≥ 1), le shader n'est PAS activé : un
/// shader qui ne fait rien ne coûte pas une passe de rendu.
@available(iOS 17.0, macOS 14.0, *)
struct EphemeralBurnLayer: ViewModifier, Animatable {
    var progress: Double
    let frontDirection: Double
    let drift: Double
    let seed: Double

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        let library = EphemeralBurnShaders.library
        let progress = progress
        let frontDirection = frontDirection
        let drift = drift
        let seed = seed
        let overhang = CGSize(width: EphemeralBurnOverhang.horizontal, height: EphemeralBurnOverhang.top)
        return content
            .padding(.horizontal, EphemeralBurnOverhang.horizontal)
            .padding(.top, EphemeralBurnOverhang.top)
            .visualEffect { view, proxy in
                view.layerEffect(
                    library.meeshyEphemeralBurn(
                        .float2(proxy.size), .float(progress), .float(frontDirection),
                        .float(drift), .float(seed), .float2(overhang)
                    ),
                    maxSampleOffset: EphemeralBurnShaders.maxSampleOffset,
                    isEnabled: EphemeralBurnShaders.isActive(progress)
                )
            }
            .padding(.horizontal, -EphemeralBurnOverhang.horizontal)
            .padding(.top, -EphemeralBurnOverhang.top)
    }
}

/// **La dérive suit le vent en direct.** Monté SEULEMENT pendant une
/// combustion : l'observation du vent (30 Hz, 1,2 s) ne coûte rien aux
/// milliers de bulles qui ne brûlent pas.
@available(iOS 17.0, macOS 14.0, *)
struct EphemeralBurnDriftHost<C: View>: View {
    @ObservedObject var wind: EphemeralBurnWind
    let side: EphemeralBurnSide
    let progress: Double
    let ignition: EphemeralBurnIgnition
    let content: C

    var body: some View {
        content.modifier(EphemeralBurnLayer(
            progress: progress,
            frontDirection: ignition.frontDirection,
            drift: EphemeralBurnLaw.wind(raw: wind.raw, side: side),
            seed: ignition.seed
        ))
    }
}

/// **Le repli** — iOS 16, et « Réduire les animations » sur tout iOS : la
/// combustion d'avant #17938, inchangée. La bulle se consume (rétrécit, se
/// dore, s'efface) en `EphemeralBurn.fullDuration` ; sous Reduce Motion elle
/// perd son MOUVEMENT, pas son annonce — ni rétrécissement ni lueur, un simple
/// fondu, plus court (règle 6 des effets de message).
struct EphemeralBurnFallback: ViewModifier {
    let isBurning: Bool
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        content
            .opacity(isBurning ? 0 : 1)
            .scaleEffect(scale, anchor: .center)
            .blur(radius: isBurning && !reduceMotion ? 6 : 0)
            .overlay { emberGlow }
            .animation(
                .easeOut(duration: EphemeralBurn.duration(reduceMotion: reduceMotion)),
                value: isBurning
            )
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
            RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus, style: .continuous)
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
