import UIKit
import MeeshySDK

// MARK: - Les groupes de pièces d'un envoi, prêts pour la phase optimiste ET l'upload
//
// Extrait de `ConversationView+AttachmentHandlers.swift` (cohésion) : la liste
// est construite UNE fois, et la phase optimiste comme la phase d'upload
// l'itèrent, de sorte que les `tempId` ne se désynchronisent jamais (un groupe
// sans pièce locale est exclu des DEUX phases, pas seulement de l'insert).

/// Un groupe média du plan, apparié à son `tempId` stable.
struct OutgoingMediaGroup {
    let group: MultiAttachmentSendPlanner.PlannedMessage
    let tempId: String
    let locals: [MeeshyMessageAttachment]   // non-empty; already cache-seeded

    /// Construit la liste des groupes envoyables. Les effets de bord (amorçage
    /// du cache d'images) ont lieu ICI, une seule fois.
    static func sendable(
        plan: [MultiAttachmentSendPlanner.PlannedMessage],
        mediaFiles: [String: URL],
        thumbnails: [String: UIImage],
        currentUserId: String,
        senderColor: String,
        seedsPreviewCache: Bool = true
    ) -> [OutgoingMediaGroup] {
        plan.filter { $0.kind != .text }.compactMap { group in
            let locals: [MeeshyMessageAttachment] = group.attachments.compactMap { att in
                guard let fileURL = mediaFiles[att.id] else { return nil }
                let isImage = att.mimeType.hasPrefix("image/")
                // #10789 — en E2EE, aucun clair ne gagne le cache d'images : la bulle
                // optimiste lit son fichier local (`file://`) directement.
                if isImage, seedsPreviewCache {
                    // Seed in-memory NSCache + on-disk image cache so the
                    // optimistic bubble keeps the picture across navigation
                    // until the server `message:new` reconciliation lands.
                    // The read hops off the MainActor (readAttachmentFileBytes)
                    // — this compactMap runs synchronously on the tap-Send
                    // call stack, so a raw `Data(contentsOf:)` here froze the
                    // UI for the whole read of every selected photo/video.
                    let persistKey = fileURL.absoluteString
                    Task {
                        guard let data = await OutgoingAttachmentRules.readAttachmentFileBytes(fileURL),
                              let image = UIImage(data: data) else { return }
                        DiskCacheStore.cacheImageForPreview(image, key: persistKey)
                        await CacheCoordinator.shared.images.save(data, for: persistKey)
                    }
                }
                // A video/audio file:// URL cannot be decoded as a still — seed
                // a ThumbHash from the generated thumbnail so the bubble shows a
                // recognisable preview instantly. Images render from the cache.
                let optimisticThumbHash = isImage ? nil : thumbnails[att.id]?.toThumbHash()
                return MeeshyMessageAttachment(
                    id: att.id,
                    // Le NOM et le POIDS voyagent avec la bulle optimiste. Sans
                    // eux, `DocumentViewerView` retombe sur le libellé du type
                    // (« PDF ») et n'affiche AUCUNE taille : le document envoyé
                    // s'affichait « Document », puis sautait à son vrai nom à
                    // l'écho serveur — un saut de contenu, là où la demande
                    // veut « comme si tout était instantané ». La pièce en
                    // attente les porte déjà (`appendPendingFileAttachment`).
                    fileName: att.fileName,
                    originalName: att.originalName,
                    mimeType: att.mimeType.isEmpty ? "application/octet-stream" : att.mimeType,
                    fileSize: att.fileSize,
                    fileUrl: fileURL.absoluteString,
                    width: att.width,
                    height: att.height,
                    thumbnailUrl: isImage ? fileURL.absoluteString : nil,
                    thumbHash: optimisticThumbHash,
                    duration: att.duration,
                    uploadedBy: currentUserId,
                    thumbnailColor: senderColor
                )
            }
            guard !locals.isEmpty else { return nil }
            // Phase 4 §6.2 — `cid_<uuid v4 lowercase>` so the gateway accepts
            // the value as `clientMessageId` (the legacy `temp_<UUID>` prefix
            // fails the strict wire regex).
            return OutgoingMediaGroup(group: group, tempId: ClientMessageId.generate(), locals: locals)
        }
    }
}
