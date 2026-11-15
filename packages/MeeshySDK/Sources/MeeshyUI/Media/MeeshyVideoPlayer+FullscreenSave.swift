import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Enregistrer dans Photos, depuis le plein écran
//
// Sorti de `MeeshyVideoPlayer+Renderers.swift` (#9575) : le fichier touchait le
// plafond de 1 200 lignes, et l'enregistrement est une responsabilité à part —
// il ne lit ni le moteur ni l'état de lecture.

extension _FullscreenRenderer {

    func saveToPhotos() {
        guard let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        saveState = .saving
        HapticFeedback.light()
        Task {
            do {
                let tempFile = FileManager.default.temporaryDirectory
                    .appendingPathComponent("save_\(UUID().uuidString).mp4")
                if let cached = CacheCoordinator.videoLocalFileURL(for: url.absoluteString) {
                    // Cache-first : l'état .ready qui a permis la lecture implique
                    // que le fichier est déjà dans le DiskCacheStore vidéo — le
                    // copier évite de re-télécharger un média déjà sur disque.
                    try FileManager.default.copyItem(at: cached, to: tempFile)
                } else {
                    // Pull from URLSession.download (streams to disk) — avoids
                    // double-loading a 200MB file into memory like .data(from:) would.
                    let (tempURL, _) = try await URLSession.shared.download(from: url)
                    try FileManager.default.moveItem(at: tempURL, to: tempFile)
                }
                // Dédoublonné (#10370) : déjà dans l'album ⇒ rien n'est écrit, et on le dit.
                let outcome = await PhotoLibraryManager.shared.addVideo(at: tempFile, alias: player.attachment.id)
                let ok = outcome.isInAlbum
                try? FileManager.default.removeItem(at: tempFile)
                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        saveState = ok ? .saved : .failed
                    }
                    if outcome == .alreadyPresent { PhotoAlbumSaveFeedback.announceAlreadyInAlbum() }
                    if ok {
                        HapticFeedback.success()
                        player.onSaveSuccess?()
                    } else {
                        HapticFeedback.error()
                    }
                }
            } catch {
                await MainActor.run {
                    withAnimation { saveState = .failed }
                    HapticFeedback.error()
                }
            }
        }
    }
}
