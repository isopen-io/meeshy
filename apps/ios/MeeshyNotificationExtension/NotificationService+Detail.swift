@preconcurrency import UserNotifications
import Foundation
import MeeshySDK

/// La pièce jointe du détail, écrite depuis la file d'un téléchargement et
/// relue par `group.notify` : une seule écriture, sous verrou.
nonisolated final class DetailAttachmentBox: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: UNNotificationAttachment?

    func store(_ attachment: UNNotificationAttachment) {
        lock.withLock { stored = attachment }
    }

    var value: UNNotificationAttachment? {
        lock.withLock { stored }
    }
}

/// Le DÉTAIL d'un message sur l'écran verrouillé (#8858) : la carte d'une
/// position, la vignette d'une vidéo, le corps d'une carte de visite, d'une
/// invitation ou d'un lien. Toutes les décisions sont dans
/// `NotificationDetailPolicy` (pure, témoignée) ; ce fichier ne fait que les
/// exécuter avec les outils de l'extension.
nonisolated extension NotificationService {

    /// Les libellés du corps détaillé, résolus dans le catalogue de
    /// l'extension (qui ne partage pas celui de l'app), dans la langue que
    /// l'app publie au groupe d'app (#8951).
    static var detailLabels: NotificationMessageDetail.Labels {
        let bundle = InterfaceLanguageResolver.bundle()
        return NotificationMessageDetail.Labels(
            sharedLocation: NSLocalizedString("notification.detail.sharedLocation", bundle: bundle, comment: ""),
            invitation: NSLocalizedString("notification.detail.invitation", bundle: bundle, comment: "")
        )
    }

    /// Réécrit le corps quand la passerelle ne l'a pas composé.
    func applyDetailedBody(to content: UNMutableNotificationContent) {
        guard let body = NotificationDetailPolicy.detailedBody(
            currentBody: content.body,
            userInfo: content.userInfo,
            labels: Self.detailLabels
        ) else { return }
        content.body = body
    }

    /// Lance, dans le groupe de téléchargements de l'extension, la pièce jointe
    /// que le DÉTAIL appelle quand le message n'en a pas d'autre : la carte
    /// d'une position, ou la vignette d'une vidéo. Tout est sous le second
    /// verrou de protection (`NotificationDetailPolicy`) : un message protégé
    /// n'entre dans aucune des deux branches.
    func enqueueDetailAttachment(
        userInfo: [AnyHashable: Any],
        apiBaseURL: String,
        group: DispatchGroup,
        deliver: @escaping @Sendable (UNNotificationAttachment) -> Void
    ) {
        if case .location(let place) = NotificationDetailPolicy.detail(userInfo: userInfo) {
            let remaining = Self.nseBudget - Date().timeIntervalSince(extensionStartTime)
            guard let timeout = NotificationDetailPolicy.snapshotTimeout(
                budgetRemaining: remaining, minimum: Self.minDownloadBudget
            ) else { return }
            group.enter()
            NSELocationSnapshot.render(latitude: place.latitude, longitude: place.longitude, timeout: timeout) { fileURL in
                defer { group.leave() }
                guard let fileURL else { return }
                guard let attachment = try? UNNotificationAttachment(
                    identifier: UUID().uuidString,
                    url: fileURL,
                    options: [UNNotificationAttachmentOptionsTypeHintKey: "public.png"]
                ) else {
                    try? FileManager.default.removeItem(at: fileURL)
                    return
                }
                deliver(attachment)
            }
            return
        }

        guard let raw = NotificationDetailPolicy.videoThumbnailURL(userInfo: userInfo),
              let thumbnailURL = NotificationPayloadHelpers.resolveRemoteMediaURL(raw, apiBaseURL: apiBaseURL)
        else { return }
        let mime = NotificationDetailPolicy.thumbnailMimeType(for: thumbnailURL)
        group.enter()
        downloadFile(from: thumbnailURL) { [weak self] fileURL in
            defer { group.leave() }
            guard let self, let fileURL else { return }
            guard NSEAttachmentPolicy.mayAttach(
                mimeType: mime, fileSize: NotificationService.fileSize(at: fileURL)
            ) else {
                try? FileManager.default.removeItem(at: fileURL)
                return
            }
            if let attachment = self.createMessageAttachment(
                fromFile: fileURL, originalURL: thumbnailURL, mimeType: mime
            ) {
                deliver(attachment)
            }
        }
    }
}
