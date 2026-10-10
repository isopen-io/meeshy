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
        StoryVideoUploadFile(fileURL: sourceURL, mimeType: "video/mp4", isDerived: false)
    }

    static func mimeType(for url: URL) -> String {
        "video/mp4"
    }
}
