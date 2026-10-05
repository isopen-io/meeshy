import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **L'atelier « Imagine », présenté par le contrôleur le plus haut** — le menu
/// du message vient de se refermer, et la conversation n'a ni état ni
/// modificateur à porter pour lui (son `body` est déjà au bord de sa
/// profondeur de type). Même motif que `EmailVerificationGateScreen`.
///
/// « Imager » s'ouvre aussi depuis la feuille « Plus… » (#8692), qui se
/// referme au même instant : présenter PENDANT sa fermeture échouerait en
/// silence (un contrôleur ne présente pas deux fois), et la fermeture
/// emporterait l'atelier avec elle. On attend donc qu'elle soit partie.
enum MessageCardExportPresenter {

    /// ~2 s au plus : au-delà, la feuille qui se fermait ne se fermera plus.
    private static let maxAttempts = 14
    private static let retryDelay: TimeInterval = 0.15

    @MainActor
    static func present(_ request: MessageCardExportRequest) {
        present(request, attempt: 0)
    }

    @MainActor
    private static func present(_ request: MessageCardExportRequest, attempt: Int) {
        switch topMostController() {
        case .busy:
            guard attempt < maxAttempts else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + retryDelay) {
                present(request, attempt: attempt + 1)
            }
        case .none:
            return
        case .ready(let top):
            let presented = PresentedHost()
            let host = ExportHostingController(rootView: MessageCardExportSheet(request: request) {
                presented.controller?.presentingViewController?.dismiss(animated: true)
            })
            presented.controller = host
            host.modalPresentationStyle = .pageSheet
            host.sheetPresentationController?.detents = [.large()]
            host.sheetPresentationController?.prefersGrabberVisible = true
            top.present(host, animated: true)
        }
    }

    private enum Top {
        case ready(UIViewController)
        /// Une feuille est en train de se fermer : réessayer tout à l'heure.
        case busy
        case none
    }

    @MainActor
    private static func topMostController() -> Top {
        guard var top = DeviceLayout.activeWindow?.rootViewController else { return .none }
        while let presented = top.presentedViewController {
            if presented.isBeingDismissed { return .busy }
            top = presented
        }
        return top.isBeingDismissed ? .busy : .ready(top)
    }
}

/// Le contrôleur présenté, tenu FAIBLEMENT : la feuille le ferme sans le retenir.
private final class PresentedHost {
    weak var controller: UIViewController?
    nonisolated deinit {}
}

private final class ExportHostingController: UIHostingController<MessageCardExportSheet> {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}
}
