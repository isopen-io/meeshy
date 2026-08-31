// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum AttachmentsEndpoint: MeeshyEndpoint, Sendable {
    case batchAnalysis
    case byAttachmentId(attachmentId: String)
    case byAttachmentIdAnalysis(attachmentId: String)
    case byAttachmentIdMetadata(attachmentId: String)
    case byAttachmentIdStatus(attachmentId: String)
    case byAttachmentIdStatusDetails(attachmentId: String)
    case byAttachmentIdThumbnail(attachmentId: String)
    case byAttachmentIdTranscribe(attachmentId: String)
    case byAttachmentIdTranslate(attachmentId: String)
    case fileByWildcard(wildcard: String)
    case upload
    case uploadText

    public var path: String {
        switch self {
        case .batchAnalysis: return "/api/v1/attachments/batch/analysis"
        case .byAttachmentId(let attachmentId): return "/api/v1/attachments/\(attachmentId)"
        case .byAttachmentIdAnalysis(let attachmentId): return "/api/v1/attachments/\(attachmentId)/analysis"
        case .byAttachmentIdMetadata(let attachmentId): return "/api/v1/attachments/\(attachmentId)/metadata"
        case .byAttachmentIdStatus(let attachmentId): return "/api/v1/attachments/\(attachmentId)/status"
        case .byAttachmentIdStatusDetails(let attachmentId): return "/api/v1/attachments/\(attachmentId)/status-details"
        case .byAttachmentIdThumbnail(let attachmentId): return "/api/v1/attachments/\(attachmentId)/thumbnail"
        case .byAttachmentIdTranscribe(let attachmentId): return "/api/v1/attachments/\(attachmentId)/transcribe"
        case .byAttachmentIdTranslate(let attachmentId): return "/api/v1/attachments/\(attachmentId)/translate"
        case .fileByWildcard(let wildcard): return "/api/v1/attachments/file/\(wildcard)"
        case .upload: return "/api/v1/attachments/upload"
        case .uploadText: return "/api/v1/attachments/upload-text"
        }
    }
}
