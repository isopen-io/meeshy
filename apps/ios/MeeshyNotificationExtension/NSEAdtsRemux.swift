import AVFoundation
import Foundation

/// La voix d'un talkie arrive en trames AAC ADTS brutes (`audio/aac`), qu'une pièce jointe de notification ne sait pas
/// porter : elle est REMISE en conteneur `.m4a`, sans réencodage, avant d'être attachée.
nonisolated enum NSEAdtsRemux {
    static let remuxedMimeType = "audio/mp4"

    static func needsRemux(mimeType: String) -> Bool {
        mimeType.lowercased() == "audio/aac"
    }

    /// Le fichier `.m4a`, ou `nil` si le flux est illisible. Le fichier ADTS est effacé dans les deux cas.
    static func m4a(from adts: URL) async -> URL? {
        let source = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".aac")
        let output = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
        defer { try? FileManager.default.removeItem(at: source) }
        do {
            try FileManager.default.moveItem(at: adts, to: source)
        } catch {
            try? FileManager.default.removeItem(at: adts)
            return nil
        }
        guard let export = AVAssetExportSession(asset: AVURLAsset(url: source), presetName: AVAssetExportPresetPassthrough) else {
            return nil
        }
        export.outputURL = output
        export.outputFileType = .m4a
        await export.export()
        guard export.status == .completed else {
            try? FileManager.default.removeItem(at: output)
            return nil
        }
        return output
    }
}

/// Un téléchargement qui porte le jeton de la session ne suit une redirection que vers la passerelle, sous un chemin
/// attendu : toute autre redirection est refusée, le jeton ne part jamais ailleurs.
nonisolated final class NSETokenRedirectGuard: NSObject, URLSessionTaskDelegate, Sendable {
    private let apiBaseURL: String

    init(apiBaseURL: String) {
        self.apiBaseURL = apiBaseURL
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(NotificationDetailPolicy.mayCarrySessionToken(request.url, apiBaseURL: apiBaseURL) ? request : nil)
    }
}
