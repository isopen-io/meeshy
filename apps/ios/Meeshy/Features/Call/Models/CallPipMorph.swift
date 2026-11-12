import Combine
import SwiftUI
import MeeshySDK

/// #17763 — le morphisme entre l'appel plein écran et la capsule : la
/// CONTRACTION (réduction au toucher, glissé, ou lancement d'un partage) et le
/// DÉPLOIEMENT depuis la capsule. Le flux plein écran se contracte vers le haut
/// — là où la capsule apparaît — puis la fenêtre se retire sans animation
/// système : la contraction est LA transition. « Réduire les animations » :
/// bascule directe, que la fenêtre d'appel adoucit par son fondu court
/// (`CallShareCapsuleMotion.windowFade`).
@MainActor
enum CallPipMorph {
    /// Réveille `CallView` quand un partage commence alors qu'elle est plein écran.
    static let collapseRequests = PassthroughSubject<Void, Never>()
    private static var isCollapsePending = false

    /// Le partage vient de commencer : plein écran ⇒ l'appel se contracte vers
    /// la capsule, avec un repli si aucune vue ne prend la demande ; déjà
    /// réduit ⇒ rien à contracter.
    static func begin(on manager: CallManager) {
        guard manager.displayMode == .fullScreen else {
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

    static func contract(into manager: CallManager, reduceMotion: Bool, progress: Binding<CGFloat>) {
        guard !reduceMotion else {
            manager.displayMode = .pip
            return
        }
        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
            progress.wrappedValue = 1
        }
        Task { @MainActor in
            _ = await cancellableSleep(for: .milliseconds(300))
            var swap = Transaction()
            swap.disablesAnimations = true
            withTransaction(swap) { manager.displayMode = .pip }
            progress.wrappedValue = 0
        }
    }

    /// Mouvement inverse de `contract` : le contenu démarre contracté vers le
    /// haut (là où vivait la capsule) puis s'étire en plein écran.
    static func playPendingExpansion(of manager: CallManager, reduceMotion: Bool, progress: Binding<CGFloat>) {
        guard manager.consumePendingPipExpansion(), !reduceMotion else { return }
        progress.wrappedValue = 1
        withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
            progress.wrappedValue = 0
        }
    }
}
