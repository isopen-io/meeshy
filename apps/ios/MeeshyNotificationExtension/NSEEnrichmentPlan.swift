import Foundation
import MeeshySDK

struct NSEAttachmentSource: Sendable, Equatable {
    let url: URL
    let mimeType: String
}

struct NSEAttachmentFile: Sendable, Equatable {
    let fileURL: URL
    let originalURL: URL
    let mimeType: String
}

struct NSEEnrichmentRequest: Sendable, Equatable {

    enum Detail: Sendable, Equatable {
        case location(latitude: Double, longitude: Double, timeout: TimeInterval)
        case videoThumbnail(NSEAttachmentSource)
    }

    let avatarURL: URL?
    let media: NSEAttachmentSource?
    let detail: Detail?
    let replacement: NotificationReplacement?

    static func make(
        userInfo: [AnyHashable: Any],
        apiBaseURL: String,
        budget: NSEBudget,
        now: Date
    ) -> NSEEnrichmentRequest {
        NSEEnrichmentRequest(
            avatarURL: remoteURL(userInfo["imageURL"], apiBaseURL: apiBaseURL),
            media: media(userInfo: userInfo, apiBaseURL: apiBaseURL),
            detail: detail(userInfo: userInfo, apiBaseURL: apiBaseURL, budget: budget, now: now),
            replacement: NotificationReplacement(userInfo: userInfo)
        )
    }

    private static func remoteURL(_ raw: Any?, apiBaseURL: String) -> URL? {
        guard let raw = raw as? String else { return nil }
        return NotificationPayloadHelpers.resolveRemoteMediaURL(raw, apiBaseURL: apiBaseURL)
    }

    private static func media(userInfo: [AnyHashable: Any], apiBaseURL: String) -> NSEAttachmentSource? {
        guard let url = remoteURL(userInfo["attachmentUrl"], apiBaseURL: apiBaseURL) else { return nil }
        let mimeType = userInfo["attachmentMimeType"] as? String ?? ""
        let declaredSize = NSEAttachmentPolicy.declaredFileSize(userInfo["attachmentFileSize"])
        guard !NSEAttachmentPolicy.declaresProtection(userInfo: userInfo),
              NSEAttachmentPolicy.mayAttach(mimeType: mimeType, fileSize: declaredSize) else { return nil }
        return NSEAttachmentSource(url: url, mimeType: mimeType)
    }

    private static func detail(
        userInfo: [AnyHashable: Any],
        apiBaseURL: String,
        budget: NSEBudget,
        now: Date
    ) -> Detail? {
        if case .location(let place) = NotificationDetailPolicy.detail(userInfo: userInfo) {
            return NotificationDetailPolicy
                .snapshotTimeout(budgetRemaining: budget.remaining(at: now), minimum: NSEBudget.minimumDownload)
                .map { .location(latitude: place.latitude, longitude: place.longitude, timeout: $0) }
        }
        guard let url = remoteURL(NotificationDetailPolicy.videoThumbnailURL(userInfo: userInfo), apiBaseURL: apiBaseURL)
        else { return nil }
        return .videoThumbnail(
            NSEAttachmentSource(url: url, mimeType: NotificationDetailPolicy.thumbnailMimeType(for: url))
        )
    }
}

enum NSEEnrichmentPart: Sendable {
    case avatar(Data?)
    case media(NSEAttachmentFile?)
    case detail(NSEAttachmentFile?)
    case replacementSettled
}

struct NSEEnrichmentResult: Sendable, Equatable {
    let avatarData: Data?
    let attachment: NSEAttachmentFile?

    static func folding(_ parts: [NSEEnrichmentPart]) -> NSEEnrichmentResult {
        var avatar: Data?
        var media: NSEAttachmentFile?
        var detail: NSEAttachmentFile?
        for part in parts {
            switch part {
            case .avatar(let data): avatar = avatar ?? data
            case .media(let file): media = media ?? file
            case .detail(let file): detail = detail ?? file
            case .replacementSettled: break
            }
        }
        return NSEEnrichmentResult(avatarData: avatar, attachment: media ?? detail)
    }
}
