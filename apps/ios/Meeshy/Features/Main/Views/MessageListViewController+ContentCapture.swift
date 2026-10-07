import UIKit
import MeeshySDK

// MARK: - Ce que le fil montre à l'instant d'une capture (#9617)

/// Le fil (Bulles, Focal, Script) répond par ses cellules VISIBLES — la même
/// source que les accusés de lecture (`visibleServerMessageIds`), lue à
/// l'instant de la capture, jamais tenue dans un second registre. Sous la
/// Rivière ou le Résumé, panes opaques, et hors fenêtre (un écran poussé
/// par-dessus), il ne montre rien.
extension MessageListViewController: ContentCaptureSource {

    var isCaptureCover: Bool { false }

    func visibleCaptureCandidates() -> [ContentCaptureCandidate] {
        guard isViewLoaded, dataSource != nil, rendersThread, view.window != nil else { return [] }
        return collectionView.indexPathsForVisibleItems.flatMap { indexPath -> [ContentCaptureCandidate] in
            guard case .message(let localId)? = dataSource.itemIdentifier(for: indexPath),
                  let serverId = store.message(for: localId)?.serverId,
                  var message = store.domainMessage(for: localId, currentUserId: currentUserId) else { return [] }
            // La vue unique texte RÉVÉLÉE vit à la visite, pas en base : la
            // même pose que la cellule (`applyVisitState`).
            applyVisitState(to: &message)
            return ContentCaptureVisibility.candidates(for: message, serverId: serverId)
        }
    }
}
