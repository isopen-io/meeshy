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
/// l'écran de partage la PRÉSENTE — un utilisateur qui se connecte deux heures
/// plus tard la retrouve, une app tuée avant la connexion ne la perd pas.
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

    init(
        directory: @escaping () -> URL? = { ShareRelayHandoff.directoryURL() },
        mediaRoot: @escaping () -> URL? = { ShareRelayHandoff.mediaRootURL() },
        now: @escaping () -> Date = Date.init
    ) {
        self.directory = directory
        self.mediaRoot = mediaRoot
        self.now = now
    }

    func consumeNext(id: String? = nil) {
        guard pending == nil, let directory = directory(),
              let fiche = ShareRelayHandoff.next(id: id, in: directory, now: now()) else { return }
        pending = PendingRelay(shareId: fiche.shareId, incoming: fiche.incoming(mediaRoot: mediaRoot()))
    }

    /// L'écran de partage l'a présentée : la fiche est soldée. Les fichiers
    /// restent jusqu'à l'envoi (l'outbox les recopie à l'enfilement), puis le
    /// balayage des dossiers orphelins les rend (`SharePendingSendConsumer`).
    func markPresented(_ shareId: String) {
        if pending?.shareId == shareId { pending = nil }
        guard let directory = directory() else { return }
        ShareRelayHandoff.remove(shareId: shareId, in: directory)
        consumeNext()
    }

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
            .onAppear { present(consumer.pending) }
    }

    private func present(_ relay: ShareRelayConsumer.PendingRelay?) {
        guard let relay, router.pendingShareContent == nil else { return }
        router.pendingShareContent = relay.subject
        consumer.markPresented(relay.shareId)
    }
}
