import Foundation
import MeeshySDK

nonisolated struct StoryVideoUploadFile: Equatable, Sendable {
    let fileURL: URL
    let mimeType: String
    let isDerived: Bool

    static func prepared(
        from sourceURL: URL,
        compress: @Sendable @concurrent (URL) async throws -> URL
    ) async -> StoryVideoUploadFile {
        guard let compressedURL = try? await compress(sourceURL) else {
            return StoryVideoUploadFile(fileURL: sourceURL, mimeType: mimeType(for: sourceURL), isDerived: false)
        }
        return StoryVideoUploadFile(
            fileURL: compressedURL,
            mimeType: mimeType(for: compressedURL),
            isDerived: compressedURL != sourceURL
        )
    }

    static func mimeType(for url: URL) -> String {
        let resolved = MimeTypeResolver.mimeType(forURL: url)
        return resolved.hasPrefix("video/") ? resolved : "video/mp4"
    }
}
