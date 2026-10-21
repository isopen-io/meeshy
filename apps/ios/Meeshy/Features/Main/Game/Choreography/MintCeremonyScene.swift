import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — la scène plein écran qui part AU TOUCHER : des milliers
/// d'étincelles quittent ta lumière et tissent un cercle en tresse, Mee et Meo y sèment la poussière (argent et un peu
/// d'or ; or pur ; or et diamant), le flan se fige et descend sur l'enclume, Mee pose le coin, Meo lève le marteau — et
/// le garde levé tant que la passerelle n'a pas répondu —, puis la frappe arrive EN DERNIER : la gravure apparaît sous
/// le marteau, la pièce se lève et montre son revers, Mee et Meo la fêtent et elle file dans l'Héritage. Au refus, une
/// Ombre voile le cercle et les étincelles reviennent à ta lumière ; Mee dit ce qui bloque.
///
/// QUAND : la loi partagée (`GameMintCeremony`). COMMENT : `MintCeremonyChoreography` et `MintCeremonyParticles`. Cette
/// vue ne fait qu'appliquer, à chaque image d'un `TimelineView` : les particules dans UN `Canvas` (rangées en lots,
/// peintes sur le GPU), le reste en position, rotation et opacité. Miroir de
/// `apps/web/src/components/game/mint-ceremony.tsx`.
///
/// Toucher passe la scène. Sous « Réduire les animations », un fondu (la loi le dit). Pour le lecteur d'écran, la scène
/// est UN élément : il dit la phrase de Mee, et un toucher la passe.
struct MintCeremonyScene: View {
    @ObservedObject var run: MintCeremonyRun

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            GeometryReader { proxy in
                let stage = MintCeremonyFit(size: proxy.size)
                TimelineView(.animation(minimumInterval: nil, paused: run.isFinished)) { _ in
                    content(stage: stage, uptime: ProcessInfo.processInfo.systemUptime)
                }
            }
            .ignoresSafeArea()
            Text(MintCeremonyCopy.skip)
                .font(.system(size: 11))
                .foregroundColor(MintCeremonyPalette(edition: run.edition).hint)
                .padding(.trailing, 14)
                .padding(.bottom, 10)
        }
        .contentShape(Rectangle())
        .onTapGesture { run.skip() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityHint(MintCeremonyCopy.skip)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { run.skip() }
        .accessibilityIdentifier("game.mint.ceremony")
    }

    private var spoken: String {
        if let refusal = run.refusal { return MintCeremonyCopy.refused(refusal) }
        return MintCeremonyCopy.say(run.edition, number: run.number)
    }

    @ViewBuilder
    private func content(stage: MintCeremonyFit, uptime: TimeInterval) -> some View {
        let nowMs = run.elapsedMs
        let t = nowMs / 1000
        let plan = run.plan(atMs: nowMs)
        let frame = MintCeremonyChoreography.frame(plan, at: t)
        let palette = MintCeremonyPalette(edition: run.edition)
        let _ = run.noteFrame(at: uptime)
        let batches = run.reduced ? [] : run.particles.batches(plan, at: t, stride: run.stride).batches
        ZStack(alignment: .topLeading) {
            MintCeremonyBackdrop(palette: palette)
                .opacity(frame.backdrop)
            ZStack(alignment: .topLeading) {
                MintCeremonyStageLayers(edition: run.edition, number: run.number, refusal: run.refusal, batches: batches,
                                        reduced: run.reduced, frame: frame, stage: stage, palette: palette)
                    .opacity(frame.backdrop)
                MintCeremonyCoinLayers(edition: run.edition, number: run.number, frame: frame, stage: stage, palette: palette)
            }
            .offset(x: frame.shake.x * stage.k, y: frame.shake.y * stage.k)
        }
        .frame(width: stage.size.width, height: stage.size.height)
        .environment(\.layoutDirection, .leftToRight)
    }
}

// MARK: - La mise à l'échelle : la scène de 360 × 640 portée dans l'écran sans déformation

struct MintCeremonyFit: Equatable {
    let size: CGSize
    let k: CGFloat
    let offX: CGFloat
    let offY: CGFloat

    init(size: CGSize) {
        self.size = size
        let fit = min(size.width / MintCeremonyStage.size.width, size.height / MintCeremonyStage.size.height)
        k = fit > 0 ? fit : 1
        offX = (size.width - MintCeremonyStage.size.width * k) / 2
        offY = (size.height - MintCeremonyStage.size.height * k) / 2
    }

    /// Le centre, dans l'écran, d'une boîte posée en `(x, y)` (coin haut-gauche) de taille `w × h` dans la scène.
    func center(x: Double, y: Double, w: Double, h: Double) -> CGPoint {
        CGPoint(x: offX + (x + w / 2) * k, y: offY + (y + h / 2) * k)
    }
}

/// Pose une boîte de la scène : coin haut-gauche `(x, y)`, taille `w × h`, en unités de la scène.
struct MintCeremonyStageBox: ViewModifier {
    let stage: MintCeremonyFit
    let x: Double
    let y: Double
    let w: Double
    let h: Double

    func body(content: Content) -> some View {
        content
            .frame(width: w * stage.k, height: h * stage.k)
            .position(stage.center(x: x, y: y, w: w, h: h))
    }
}

// MARK: - Le fond

private struct MintCeremonyBackdrop: View {
    let palette: MintCeremonyPalette

    var body: some View {
        GeometryReader { proxy in
            let side = max(proxy.size.width, proxy.size.height)
            RadialGradient(stops: [.init(color: palette.bg[0], location: 0), .init(color: palette.bg[1], location: 0.62),
                                   .init(color: palette.bg[2], location: 1)],
                           center: UnitPoint(x: 0.5, y: 0.45), startRadius: 0, endRadius: side * 0.62)
        }
        .ignoresSafeArea()
    }
}
