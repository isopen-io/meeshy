import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La barre des zooms MORPHE pendant la bascule d'objectif** (#9753, porteur
/// 2026-10-09 : « pendant la bascule avant ↔ arrière, la barre des zooms évolue
/// par un effet de morphe […] pour dynamiser l'attente »).
///
/// Pendant la bascule, les pastilles de l'ancien objectif se resserrent en UNE
/// capsule où tourne le glyphe de la bascule ; le nouvel objectif en place, la
/// capsule se rouvre sur SES pastilles — ou s'efface s'il n'en a pas.
nonisolated enum ComposerZoomBarMorph {
    nonisolated enum Phase: Equatable, Sendable {
        case hidden
        case presets([CGFloat])
        case chip
        case morphing
    }

    static func phase(switching: Bool, presets: [CGFloat], factor: CGFloat) -> Phase {
        if switching { return .morphing }
        if presets.count > 1 { return .presets(presets) }
        return ComposerCaptureZoom.showsBadge(factor) ? .chip : .hidden
    }
}

/// **Le cadenas se FERME, élastique, avant de partir** (#9753, porteur
/// 2026-10-09 : « quand l'enregistrement se verrouille, le cadenas se ferme
/// avec une animation à effet élastique qui valide l'activation du verrou,
/// AVANT de disparaître »).
///
/// La séquence : ouvert (il se remplit sous le glissé) → SCELLÉ (fermé, il
/// rebondit, le temps de `hold`) → parti. Seul le verrou qui s'active sous les
/// yeux de l'auteur se scelle : un verrou posé sans cadenas affiché n'a rien à
/// fermer. Sous « réduire les animations », il se ferme sans rebond, plus vite.
nonisolated struct ComposerLockSeal: Equatable, Sendable {
    static let hold: TimeInterval = 0.6
    static let reducedHold: TimeInterval = 0.35
    /// L'échelle où le cadenas scellé bondit avant de se poser.
    static let sealedScale: CGFloat = 1.3

    private(set) var sealing = false
    private(set) var generation = 0

    /// Le verrou change d'état ; `wasShowing` : le cadenas était-il affiché juste avant ?
    mutating func lockChanged(from avant: Bool, to apres: Bool, wasShowing: Bool) {
        guard apres else {
            sealing = false
            return
        }
        guard !avant, wasShowing else { return }
        sealing = true
        generation += 1
    }

    /// Le scellement `generation` a assez duré : le cadenas part.
    mutating func finish(_ generation: Int) {
        guard generation == self.generation else { return }
        sealing = false
    }

    static func showsTrack(showsLock: Bool, seal: ComposerLockSeal) -> Bool {
        showsLock || seal.sealing
    }

    static func holdDuration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? reducedHold : hold
    }

    /// L'échelle du glyphe : il grossit sous le glissé, bondit une fois scellé ;
    /// immobile sous « réduire les animations ».
    static func glyphScale(progress: Double, sealed: Bool, reduceMotion: Bool) -> CGFloat {
        guard !reduceMotion else { return 1 }
        return sealed ? sealedScale : 1 + 0.15 * CGFloat(min(max(progress, 0), 1))
    }

    /// Le ressort ÉLASTIQUE du scellement — sous-amorti, il dépasse et revient.
    static func animation(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.32, dampingFraction: 0.38)
    }
}

/// **La barre des zooms, et son morphe pendant la bascule** (#9350, #9753).
struct ComposerCaptureZoomBar: View {
    let factor: CGFloat
    let presets: [CGFloat]
    let switching: Bool
    let onSelect: (CGFloat) -> Void
    let onStep: (Bool) -> Void

    @Namespace private var morph
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var phase: ComposerZoomBarMorph.Phase {
        ComposerZoomBarMorph.phase(switching: switching, presets: presets, factor: factor)
    }

    var body: some View {
        Group {
            switch phase {
            case .presets(let crans):
                ComposerCaptureZoomPresets(factor: factor, presets: crans, onSelect: onSelect)
                    .matchedGeometryEffect(id: "zoom.bar", in: morph)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            case .chip:
                ComposerCaptureZoomChip(factor: factor, onStep: onStep)
                    .matchedGeometryEffect(id: "zoom.bar", in: morph)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            case .morphing:
                ComposerCaptureZoomMorphPill(reduceMotion: reduceMotion)
                    .matchedGeometryEffect(id: "zoom.bar", in: morph)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            case .hidden:
                EmptyView()
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.38, dampingFraction: 0.72),
                   value: phase)
    }
}

/// La capsule de l'attente : le glyphe de la bascule y tourne.
private struct ComposerCaptureZoomMorphPill: View {
    let reduceMotion: Bool
    @State private var turned = false

    var body: some View {
        Image(systemName: "arrow.triangle.2.circlepath.camera")
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
            .foregroundStyle(.white)
            .rotationEffect(.degrees(turned ? 180 : 0))
            .frame(width: MeeshyControlSize.tapTarget + MeeshySpacing.md, height: MeeshyControlSize.tapTarget)
            .adaptiveLiquidGlass(in: Capsule())
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.45).repeatForever(autoreverses: false)) { turned = true }
            }
            .accessibilityLabel(ComposerSceneCameraCopy.flipLabel)
            .accessibilityAddTraits(.updatesFrequently)
    }
}
