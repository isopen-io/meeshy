import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **La feuille du motif de retrait, présentée par le contrôleur le plus haut**
/// (#11151) — même motif que `MessageCardExportPresenter` : le menu « … » qui
/// l'a demandée vient de se refermer, et ni le fil, ni la carte, ni le lecteur
/// plein écran n'ont d'état ou de modificateur à porter pour elle. Une feuille
/// ou une alerte encore en train de se fermer est attendue (~2 s au plus).
enum ContentRemovalPresenter {

    private static let maxAttempts = 14
    private static let retryDelay: TimeInterval = 0.15

    static func present(_ kind: ContentRemovalKind, onConfirm: @escaping (String) -> Void) {
        present(kind, onConfirm: onConfirm, attempt: 0)
    }

    private static func present(_ kind: ContentRemovalKind, onConfirm: @escaping (String) -> Void, attempt: Int) {
        switch MessageCardExportPresenter.topMostController() {
        case .busy:
            guard attempt < maxAttempts else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + retryDelay) {
                present(kind, onConfirm: onConfirm, attempt: attempt + 1)
            }
        case .none:
            return
        case .ready(let top):
            let presented = RemovalPresentedHost()
            let host = RemovalHostingController(rootView: ContentRemovalReasonSheet(kind: kind, onConfirm: onConfirm) {
                presented.controller?.presentingViewController?.dismiss(animated: true)
            })
            presented.controller = host
            host.modalPresentationStyle = .pageSheet
            host.sheetPresentationController?.detents = [.medium(), .large()]
            host.sheetPresentationController?.prefersGrabberVisible = true
            top.present(host, animated: true)
        }
    }
}

/// **« Retirer » s'offre-t-il sur une publication, pour ce lecteur ?** (#11151)
/// `nil` ⇒ l'entrée n'apparaît pas. Sinon, la fermeture rendue présente la
/// feuille du motif, puis remet `(postId, motif)` à l'hôte qui retire.
enum ContentRemovalOffer {
    static func publication(
        for post: FeedPost,
        viewerId: String? = AuthManager.shared.currentUser?.id,
        viewerRole: String? = AuthManager.shared.currentUser?.role,
        remove: @escaping (_ postId: String, _ reason: String) async -> Void
    ) -> ((String) -> Void)? {
        let mine = viewerId.map { !$0.isEmpty && $0 == post.authorId } ?? false
        guard ContentRemovalPolicy.mayRemovePublication(authoredByViewer: mine, platformRole: viewerRole) else { return nil }
        let kind = ContentRemovalKind.of(post: post)
        return { postId in
            ContentRemovalPresenter.present(kind) { reason in Task { await remove(postId, reason) } }
        }
    }
}

/// Le contrôleur présenté, tenu FAIBLEMENT : la feuille le ferme sans le retenir.
private final class RemovalPresentedHost {
    weak var controller: UIViewController?
    nonisolated deinit {}
}

private final class RemovalHostingController: UIHostingController<ContentRemovalReasonSheet> {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}
}
