import Foundation
import os
import MeeshySDK

// MARK: - L'import de documents dans le tiroir du composer
//
// Extrait de `ConversationView+AttachmentHandlers.swift` (cohésion) : la copie
// d'un fichier choisi dans le sélecteur de documents vers notre conteneur ne
// lit aucun état de la conversation. La conversation reste propriétaire de
// `pendingAttachments` : elle reçoit chaque copie par la fermeture `append`.

/// Une pièce importée dont la copie temporaire existe DÉJÀ dans notre conteneur.
struct ImportedFileCopy {
    let tempURL: URL
    let fileName: String
    let mimeType: String
    let fileSize: Int
}

enum ComposerFileImporter {

    /// Copie chaque fichier sélectionné (portée de sécurité ouverte le temps de
    /// la copie) et remet la copie à `append`, dans l'ordre. Rend `true` si au
    /// moins un fichier a été importé.
    static func importFiles(_ urls: [URL], append: (ImportedFileCopy) -> Void) -> Bool {
        var importedAny = false
        for url in urls {
            guard url.startAccessingSecurityScopedResource() else { continue }
            defer { url.stopAccessingSecurityScopedResource() }

            let fileName = url.lastPathComponent
            let size = fileSize(of: url)
            let mimeType = MimeTypeResolver.mimeType(forURL: url)

            // Copy to temp directory (security-scoped resource expires).
            // A silent `try?` here previously let a failed copy through:
            // the attachment was added to the composer pointing at a
            // tempURL that never existed, only failing at the very end
            // of the send pipeline with no diagnosable cause. Skip this
            // file and surface the failure instead of adding a phantom
            // attachment.
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("file_\(UUID().uuidString)_\(fileName)")
            do {
                try FileManager.default.copyItem(at: url, to: tempURL)
            } catch {
                Logger.messages.error("File import copy failed for \(fileName, privacy: .public): \(error.localizedDescription, privacy: .public)")
                FeedbackToastManager.shared.showError("Échec de l'import de \(fileName)")
                continue
            }

            append(ImportedFileCopy(tempURL: tempURL, fileName: fileName, mimeType: mimeType, fileSize: size))
            importedAny = true
        }
        return importedAny
    }

    static func fileSize(of url: URL) -> Int {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? Int else {
            return 0
        }
        return size
    }
}
