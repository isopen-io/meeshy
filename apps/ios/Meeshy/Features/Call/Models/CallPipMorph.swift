import Combine
import SwiftUI
import MeeshySDK

/// #17763 — le morphisme entre l'appel plein écran et la capsule : la
/// CONTRACTION (réduction au toucher, glissé, ou lancement d'un partage) et le
/// DÉPLOIEMENT depuis l'appel réduit. Le flux plein écran se contracte vers le
/// haut — là où la capsule apparaît — puis la fenêtre se retire sans animation
/// système : la contraction est LA transition. Il se redéploie depuis la
/// capsule, ou depuis la bulle là où elle flotte (P18.4). « Réduire les animations » :
/// bascule directe, que la fenêtre d'appel adoucit par son fondu court
/// (`CallShareCapsuleMotion.windowFade`).
@MainActor
enum CallPipMorph {
    /// Réveille `CallView` quand un partage commence alors qu'elle est plein écran.
    static let collapseRequests = PassthroughSubject<Void, Never>()
    private static var isCollapsePending = false

    /// Ce que fait le lancement d'un partage : plein écran ⇒ se contracter vers
    /// la capsule ; déjà réduit, capsule ou bulle ⇒ être la capsule (P18.10).
    static func shareStartStep(from mode: CallDisplayMode) -> CallShareStartStep {
        switch mode {
        case .fullScreen: return .contract
        case .pip, .bubble: return .capsule
        }
    }

    /// Le partage vient de commencer : plein écran ⇒ l'appel se contracte vers
    /// la capsule, avec un repli si aucune vue ne prend la demande ; en bulle ⇒
    /// il revient à la capsule, seule à porter « Arrêter ».
    static func begin(on manager: CallManager) {
        guard shareStartStep(from: manager.displayMode) == .contract else {
            manager.displayMode = .pip
            return
        }
        isCollapsePending = true
        collapseRequests.send()
        Task { @MainActor [weak manager] in
            _ = await cancellableSleep(for: .milliseconds(900))
            guard isCollapsePending, manager?.displayMode == .fullScreen else { return }
            isCollapsePending = false
            manager?.displayMode = .pip
        }
    }

    static func consumePendingCollapse() -> Bool {
        defer { isCollapsePending = false }
        return isCollapsePending
    }

    /// La contraction en cours : un toucher sur l'appel qui rétrécit l'annule (P18.8).
    private static var contraction: Task<Void, Never>?
    private static let expansionSpring = Animation.spring(response: 0.45, dampingFraction: 0.82)

    static func contract(into manager: CallManager, reduceMotion: Bool, progress: Binding<CGFloat>) {
        guard !reduceMotion else {
            manager.displayMode = .pip
            return
        }
        contraction?.cancel()
        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
            progress.wrappedValue = 1
        }
        contraction = Task { @MainActor in
            guard await cancellableSleep(for: .milliseconds(300)), !Task.isCancelled else { return }
            contraction = nil
            var swap = Transaction()
            swap.disablesAnimations = true
            withTransaction(swap) { manager.displayMode = .pip }
            progress.wrappedValue = 0
        }
    }

    /// P18.8 — la contraction est interruptible : toucher l'appel pendant qu'il
    /// rétrécit le rend au plein écran, du point où on le voyait.
    static func interruptContraction(progress: Binding<CGFloat>) {
        guard let pending = contraction else { return }
        pending.cancel()
        contraction = nil
        withAnimation(expansionSpring) {
            progress.wrappedValue = 0
        }
    }

    /// P18.4 — rouvrir l'appel depuis l'appel réduit, bannière ou bulle : l'appel
    /// est présenté SANS animation système et `CallView` joue le déploiement
    /// depuis `origin`, là où l'appel réduit flotte. « Réduire les animations » :
    /// bascule directe, que la fenêtre d'appel adoucit par son fondu court.
    static func expand(_ manager: CallManager, from origin: CallWindowMotion, reduceMotion: Bool) {
        guard !reduceMotion else {
            manager.displayMode = .fullScreen
            return
        }
        manager.requestPipExpansionMorph(from: origin)
        var swap = Transaction()
        swap.disablesAnimations = true
        withTransaction(swap) {
            manager.displayMode = .fullScreen
        }
    }

    /// Mouvement inverse de `contract` : le contenu démarre contracté vers
    /// l'appel réduit, là où il flottait (`origin`, l'indice consommé), puis
    /// s'étire en plein écran. Sans indice, ou sous Réduire les animations, rien.
    static func playExpansion(from origin: CallWindowMotion?, reduceMotion: Bool, target: Binding<CallWindowMotion>, progress: Binding<CGFloat>) {
        guard let origin, !reduceMotion else { return }
        target.wrappedValue = origin
        progress.wrappedValue = 1
        withAnimation(expansionSpring) {
            progress.wrappedValue = 0
        }
    }
}

/// P18.4 · P18.8 — le morph de l'écran d'appel : transformation et opacité
/// seulement, vers `target` (l'appel réduit) et depuis lui. La découpe droite,
/// constante, précède l'échelle — aucun rayon de coins animé. Pendant la
/// contraction seulement, un toucher sur l'appel qui rétrécit l'interrompt et le
/// rend au plein écran ; il suit l'appel puisqu'il est posé avant l'échelle, et
/// reste invisible pour VoiceOver : il ne vit que le temps du mouvement.
struct CallPipMorphEffect: ViewModifier {
    let target: CallWindowMotion
    @Binding var progress: CGFloat

    func body(content: Content) -> some View {
        content
            .overlay { contractionCatcher }
            .clipped()
            .scaleEffect(target.scale(at: progress), anchor: target.anchor)
            .opacity(1 - 0.55 * Double(progress))
    }

    @ViewBuilder private var contractionCatcher: some View {
        if progress > 0 {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { CallPipMorph.interruptContraction(progress: $progress) }
                .accessibilityHidden(true)
        }
    }
}

/// Le premier pas d'un partage qui commence (#17763).
nonisolated enum CallShareStartStep: Equatable, Sendable {
    case contract
    case capsule
}
