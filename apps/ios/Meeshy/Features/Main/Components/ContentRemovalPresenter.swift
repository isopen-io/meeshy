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

    static func present(
        _ kind: ContentRemovalKind, count: Int = 1, gesture: ContentModerationGesture = .remove,
        onConfirm: @escaping (String) -> Void
    ) {
        present(kind, count: count, gesture: gesture, onConfirm: onConfirm, attempt: 0)
    }

    private static func present(
        _ kind: ContentRemovalKind, count: Int, gesture: ContentModerationGesture,
        onConfirm: @escaping (String) -> Void, attempt: Int
    ) {
        switch MessageCardExportPresenter.topMostController() {
        case .busy:
            guard attempt < maxAttempts else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + retryDelay) {
                present(kind, count: count, gesture: gesture, onConfirm: onConfirm, attempt: attempt + 1)
            }
        case .none:
            return
        case .ready(let top):
            let presented = RemovalPresentedHost()
            let host = RemovalHostingController(rootView: ContentRemovalReasonSheet(kind: kind, count: count, gesture: gesture, onConfirm: onConfirm) {
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

/// **Les gestes de la modération sur une publication d'autrui** (#11151,
/// #11535) : « Retirer » et « Rendre privé », chacun derrière la feuille du
/// motif. Les mêmes rôles et la même condition les offrent tous deux — comme la
/// console web, qui sert les deux gestes sur la même permission.
struct PublicationModerationOffer {
    let remove: (String) -> Void
    let makePrivate: (String) -> Void
}

/// **« Retirer » / « Rendre privé » s'offrent-ils sur une publication, pour ce
/// lecteur ?** (#11151) `nil` ⇒ les entrées n'apparaissent pas. Sinon, chaque
/// geste présente la feuille du motif, puis remet `(postId, retrait)` à l'hôte.
enum ContentRemovalOffer {
    static func publication(
        for post: FeedPost,
        viewerId: String? = AuthManager.shared.currentUser?.id,
        viewerRole: String? = AuthManager.shared.currentUser?.role,
        withdraw: @escaping (_ postId: String, _ withdrawal: PublicationWithdrawal) async -> Void
    ) -> PublicationModerationOffer? {
        let mine = viewerId.map { !$0.isEmpty && $0 == post.authorId } ?? false
        guard ContentRemovalPolicy.mayRemovePublication(authoredByViewer: mine, platformRole: viewerRole) else { return nil }
        let kind = ContentRemovalKind.of(post: post)
        let authorId = post.authorId
        return PublicationModerationOffer(
            remove: { postId in
                ContentRemovalPresenter.present(kind) { reason in Task { await withdraw(postId, .delete(reason: reason)) } }
            },
            makePrivate: { postId in
                ContentRemovalPresenter.present(kind, gesture: .makePrivate) { reason in
                    Task { await withdraw(postId, .makePrivate(authorId: authorId, reason: reason)) }
                }
            }
        )
    }

    /// **« Retirer » sur un commentaire** — de post ou de story (#11159) : la
    /// modération de la plateforme, jamais sur le sien. La fermeture rendue
    /// reçoit le motif de la feuille, que `CommentMoreMenu` présente.
    static func comment(
        _ comment: FeedComment,
        viewerId: String? = AuthManager.shared.currentUser?.id,
        viewerRole: String? = AuthManager.shared.currentUser?.role,
        remove: @escaping (_ reason: String) -> Void
    ) -> ((String) -> Void)? {
        let mine = viewerId.map { !$0.isEmpty && $0 == comment.authorId } ?? false
        guard ContentRemovalPolicy.mayRemovePublication(authoredByViewer: mine, platformRole: viewerRole) else { return nil }
        return remove
    }

    /// **« Retirer » s'offre-t-il sur une SÉLECTION de messages ?** (#11159) Au
    /// moins un message d'un autre, tous retirables par ce lecteur, et les siens
    /// supprimables pour tous — ils partent avec, sans motif.
    static func selectionOffersRemoval(
        _ selected: [Message],
        mayRemove: (Message) -> Bool,
        mayDeleteForEveryone: (Message) -> Bool
    ) -> Bool {
        let others = selected.filter { !$0.isMe }
        guard !others.isEmpty, others.allSatisfy(mayRemove) else { return false }
        return selected.filter(\.isMe).allSatisfy(mayDeleteForEveryone)
    }

    /// L'entrée « Retirer » d'un dialogue de suppression de message : `before` referme ce qui la porte,
    /// puis la feuille du motif remet le motif à `onReason`. `count` titre la feuille (#11520).
    @ViewBuilder
    static func messageButton(count: Int = 1, before: @escaping () -> Void = {}, onReason: @escaping (String) -> Void) -> some View {
        Button(String(localized: "moderation.removal.action", defaultValue: "Retirer", bundle: .main), role: .destructive) {
            before()
            ContentRemovalPresenter.present(.message, count: count, onConfirm: onReason)
        }
    }

    /// « Retirer » sur la SÉLECTION (#11159), quand `selectionOffersRemoval` l'offre : le motif d'abord,
    /// la sélection ne se quitte qu'une fois le retrait confirmé (`ConversationSelectionRemoval`).
    @ViewBuilder
    static func selectionButton(
        _ selected: [Message], ids: Set<String>, viewModel: ConversationViewModel,
        mayRemove: (Message) -> Bool, onConfirmed: @escaping () -> Void
    ) -> some View {
        if selectionOffersRemoval(selected, mayRemove: mayRemove, mayDeleteForEveryone: { viewModel.canDeleteForEveryone($0) }) {
            messageButton(count: ids.count) { reason in
                onConfirmed()
                Task { await ConversationSelectionRemoval(viewModel: viewModel).run(ids, reason: reason) }
            }
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
