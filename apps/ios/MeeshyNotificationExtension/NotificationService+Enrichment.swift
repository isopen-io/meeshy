@preconcurrency import UserNotifications
import Foundation
import MeeshySDK

extension NotificationService {

    static func enrich(
        _ request: NSEEnrichmentRequest,
        incomingIdentifier: String,
        budget: NSEBudget
    ) async -> NSEEnrichmentResult {
        await withTaskGroup(of: NSEEnrichmentPart.self) { group in
            group.addTask {
                await removeReplacedBanners(request.replacement, incomingIdentifier: incomingIdentifier)
                return .replacementSettled
            }
            if let avatarURL = request.avatarURL {
                group.addTask { .avatar(await avatarData(from: avatarURL, budget: budget)) }
            }
            if let media = request.media {
                group.addTask { .media(await attachmentFile(for: media, budget: budget)) }
            }
            if let detail = request.detail {
                group.addTask { .detail(await detailFile(for: detail, budget: budget)) }
            }
            var parts: [NSEEnrichmentPart] = []
            for await part in group { parts.append(part) }
            return NSEEnrichmentResult.folding(parts)
        }
    }

    static func downloadFile(from url: URL, budget: NSEBudget) async -> URL? {
        guard let timeout = budget.downloadTimeout() else { return nil }
        do {
            let (location, _) = try await URLSession.shared.download(for: URLRequest(url: url, timeoutInterval: timeout))
            let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.moveItem(at: location, to: destination)
            return destination
        } catch {
            return nil
        }
    }

    static func discard(_ result: NSEEnrichmentResult) {
        guard let file = result.attachment else { return }
        try? FileManager.default.removeItem(at: file.fileURL)
    }

    private static func avatarData(from url: URL, budget: NSEBudget) async -> Data? {
        guard let file = await downloadFile(from: url, budget: budget) else { return nil }
        defer { try? FileManager.default.removeItem(at: file) }
        guard let size = fileSize(at: file), size > 0, size <= NSEAttachmentPolicy.maxAttachmentBytes else { return nil }
        return try? Data(contentsOf: file)
    }

    private static func attachmentFile(for source: NSEAttachmentSource, budget: NSEBudget) async -> NSEAttachmentFile? {
        guard let file = await downloadFile(from: source.url, budget: budget) else { return nil }
        guard NSEAttachmentPolicy.mayAttach(mimeType: source.mimeType, fileSize: fileSize(at: file)) else {
            try? FileManager.default.removeItem(at: file)
            return nil
        }
        return NSEAttachmentFile(fileURL: file, originalURL: source.url, mimeType: source.mimeType)
    }

    private static func detailFile(for detail: NSEEnrichmentRequest.Detail, budget: NSEBudget) async -> NSEAttachmentFile? {
        switch detail {
        case .location(let latitude, let longitude, let timeout):
            guard let url = await NSELocationSnapshot.render(latitude: latitude, longitude: longitude, timeout: timeout)
            else { return nil }
            return NSEAttachmentFile(fileURL: url, originalURL: url, mimeType: "image/png")
        case .videoThumbnail(let source):
            return await attachmentFile(for: source, budget: budget)
        }
    }

    static let replacedBannerConfirmationBudget: TimeInterval = 2

    static func removeReplacedBanners(_ replacement: NotificationReplacement?, incomingIdentifier: String) async {
        guard let replacement else { return }
        let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
        let identifiers = replacement.identifiersToRemove(
            from: delivered.map { (id: $0.request.identifier, userInfo: $0.request.content.userInfo) },
            excluding: incomingIdentifier
        )
        guard !identifiers.isEmpty else { return }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: identifiers)
        await confirmRemoval(
            Set(identifiers),
            deadline: Date().addingTimeInterval(replacedBannerConfirmationBudget)
        )
    }

    private static func confirmRemoval(_ identifiers: Set<String>, deadline: Date) async {
        while Date() < deadline {
            let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
            guard !Set(delivered.map { $0.request.identifier }).isDisjoint(with: identifiers) else { return }
            do {
                try await Task.sleep(for: .milliseconds(50))
            } catch {
                return
            }
        }
    }
}
