import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **La feuille d'export, présentée par le contrôleur le plus haut** — le menu
/// du message vient de se refermer, et la conversation n'a ni état ni
/// modificateur à porter pour elle (son `body` est déjà au bord de sa
/// profondeur de type). Même motif que `EmailVerificationGateScreen`.
enum MessageCardExportPresenter {
    @MainActor
    static func present(_ request: MessageCardExportRequest) {
        guard let top = topMostController() else { return }
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

    @MainActor
    private static func topMostController() -> UIViewController? {
        var top = DeviceLayout.activeWindow?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
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
