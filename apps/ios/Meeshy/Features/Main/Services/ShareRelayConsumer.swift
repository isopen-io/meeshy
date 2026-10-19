import Foundation
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Reprend un partage que l'extension a relayé à l'app** (#10947 — D7 et
/// fragment 3 « Connectez-vous pour envoyer »).
///
/// L'extension dépose une `ShareRelayHandoff` puis tente d'ouvrir
/// `meeshy://share-relay` ; l'ouverture n'est qu'un raccourci, l'app balaie
/// aussi le dossier à chaque réveil. La fiche reste sur le disque jusqu'à ce que
/// l'écran de partage soit REFERMÉ (`settle`), pas seulement présenté :
/// l'extension a dit « En file », et une app tuée avant « Envoyer » doit
/// retrouver le partage. Une fiche n'est servie qu'au compte qui l'a déposée.
@MainActor
final class ShareRelayConsumer: ObservableObject {
    nonisolated deinit {}

    static let shared = ShareRelayConsumer()

    struct PendingRelay: Identifiable, Equatable {
        let shareId: String
        let incoming: ShareIncoming
        var id: String { shareId }
        var subject: ShareSubject { .incoming(incoming) }
    }

    @Published private(set) var pending: PendingRelay?

    private let directory: () -> URL?
    private let mediaRoot: () -> URL?
    private let now: () -> Date
    private let currentUserId: () -> String?

    init(
        directory: @escaping () -> URL? = { ShareRelayHandoff.directoryURL() },
        mediaRoot: @escaping () -> URL? = { ShareRelayHandoff.mediaRootURL() },
        now: @escaping () -> Date = Date.init,
        currentUserId: @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.directory = directory
        self.mediaRoot = mediaRoot
        self.now = now
        self.currentUserId = currentUserId
    }

    func consumeNext(id: String? = nil) {
        guard pending == nil, let userId = currentUserId(), !userId.isEmpty, let directory = directory(),
              let fiche = ShareRelayHandoff.next(id: id, in: directory, servableTo: userId, now: now()) else { return }
        pending = PendingRelay(shareId: fiche.shareId, incoming: fiche.incoming(mediaRoot: mediaRoot()))
    }

    /// L'écran de partage l'a présentée. La fiche RESTE : elle ne se solde
    /// qu'à la fermeture de l'écran (`settle`).
    func markPresented(_ shareId: String) {
        guard pending?.shareId == shareId else { return }
        presentedShareId = shareId
    }

    /// L'écran de partage est refermé — envoyé, mis en file ou abandonné par
    /// l'utilisateur : la fiche est soldée. Les fichiers restent jusqu'à
    /// l'envoi (l'outbox les recopie à l'enfilement), puis le balayage des
    /// dossiers orphelins les rend (`SharePendingSendConsumer`).
    func settle(_ shareId: String) {
        if pending?.shareId == shareId { pending = nil }
        if presentedShareId == shareId { presentedShareId = nil }
        guard let directory = directory() else { return }
        ShareRelayHandoff.remove(shareId: shareId, in: directory)
        consumeNext()
    }

    /// La fiche que l'écran de partage montre en ce moment.
    private(set) var presentedShareId: String?

    /// Les partages relayés encore en attente — le balayage des fichiers
    /// orphelins les épargne.
    nonisolated static func liveShareIds(in directory: URL?) -> Set<String> {
        guard let directory,
              let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return [] }
        return Set(files.filter { $0.pathExtension == "json" }.map { $0.deletingPathExtension().lastPathComponent })
    }
}

extension View {
    /// Un partage relayé par l'extension ouvre l'écran de partage de la racine.
    func shareRelayPresenter(consumer: ShareRelayConsumer, router: Router) -> some View {
        modifier(ShareRelayPresenter(consumer: consumer, router: router))
    }
}

private struct ShareRelayPresenter: ViewModifier {
    @ObservedObject var consumer: ShareRelayConsumer
    @ObservedObject var router: Router

    func body(content: Content) -> some View {
        content
            .task { consumer.consumeNext() }
            .adaptiveOnChange(of: consumer.pending) { _, relay in present(relay) }
            .adaptiveOnChange(of: router.pendingShareContent == nil) { _, closed in
                guard closed, let shown = consumer.presentedShareId else { return }
                consumer.settle(shown)
            }
            .onAppear { present(consumer.pending) }
    }

    private func present(_ relay: ShareRelayConsumer.PendingRelay?) {
        guard let relay, consumer.presentedShareId == nil, router.pendingShareContent == nil else { return }
        router.pendingShareContent = relay.subject
        consumer.markPresented(relay.shareId)
    }
}
