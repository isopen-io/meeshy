import SwiftUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Les commentaires retouchent leurs médias dans LA retouche de la caméra**
// (#11133, décision porteur 2026-10-20 : « un seul éditeur ») — la même porte
// que la conversation : « Éditer » sur une pièce ouvre `ConversationPieceRetouch`,
// « Terminé » la remplace À SA PLACE, « Abandonner » la retire. Un son n'a pas
// de retouche.

/// Les règles pures — aucune ne lit un état.
enum CommentSceneRetouch {

    /// Le plateau après un remplacement, et l'ancien fichier à purger (`nil`
    /// quand la pièce garde son fichier).
    struct Replacement {
        let attachments: [ComposerAttachment]
        let stale: URL?
    }

    /// Les pièces qui s'ouvrent en scène, dans l'ordre du plateau — mêmes
    /// règles que la conversation (`ComposerRetouchSeries.candidates`).
    static func candidates(_ attachments: [ComposerAttachment]) -> [ComposerRetouchPiece] {
        attachments.compactMap { attachment in
            guard let fileURL = attachment.url, let kind = kind(of: attachment) else { return nil }
            return ComposerRetouchPiece(attachmentId: attachment.id, fileURL: fileURL,
                                        mimeType: mimeType(of: fileURL, kind: kind), kind: kind)
        }
    }

    /// Le glyphe « Éditer » d'une pièce — `nil` quand la scène ne l'ouvre pas.
    static func editGlyph(for attachment: ComposerAttachment) -> String? {
        candidates([attachment]).isEmpty ? nil : ComposerPendingTileGlyph.edit
    }

    /// `nil` quand la pièce a quitté le plateau pendant la retouche : elle ne
    /// revient pas.
    static func replacing(_ attachments: [ComposerAttachment], id: String, with url: URL, size: Int?) -> Replacement? {
        guard let index = attachments.firstIndex(where: { $0.id == id }) else { return nil }
        var piece = attachments[index]
        let ancien = piece.url
        piece.url = url
        piece.size = size
        var plateau = attachments
        plateau[index] = piece
        return Replacement(attachments: plateau, stale: ancien == url ? nil : ancien)
    }

    private static func kind(of attachment: ComposerAttachment) -> ComposerRetouchPiece.Kind? {
        guard let url = attachment.url else { return nil }
        switch attachment.type {
        case .image:
            return ConversationImageRetouche.offersRetouche(mimeType: mimeType(of: url, kind: .image)) ? .image : nil
        case .video:
            return .video
        case .voice, .file, .location:
            return nil
        }
    }

    private static func mimeType(of url: URL, kind: ComposerRetouchPiece.Kind) -> String {
        UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
            ?? (kind == .image ? "image/jpeg" : "video/mp4")
    }
}

// MARK: - Le geste « Éditer », remis au bandeau par l'environnement

/// Posée par `.commentSceneRetouch` : le bandeau des pièces (`CommentAttachmentsTray`)
/// la lit pour offrir « Éditer » ; absente, il ne promet rien.
struct CommentRetouchAction {
    let open: (String) -> Void
}

private struct CommentRetouchActionKey: EnvironmentKey {
    static let defaultValue: CommentRetouchAction? = nil
}

extension EnvironmentValues {
    var commentRetouch: CommentRetouchAction? {
        get { self[CommentRetouchActionKey.self] }
        set { self[CommentRetouchActionKey.self] = newValue }
    }
}

extension View {
    /// Les pièces d'un commentaire se retouchent dans la retouche de la caméra.
    func commentSceneRetouch(attachments: Binding<[ComposerAttachment]>) -> some View {
        modifier(CommentSceneRetouchModifier(attachments: attachments))
    }

    /// « Éditer » sur un média de la bande des récents : la scène s'ouvre AVANT
    /// la pose, et seul ce qu'elle rend rejoint le commentaire.
    func commentRecentMediaScene(image: Binding<UIImage?>, video: Binding<URL?>,
                                 onDone: @escaping (RecentMediaPick) -> Void) -> some View {
        modifier(CommentRecentMediaSceneModifier(image: image, video: video, onDone: onDone))
    }
}

private struct CommentSceneRetouchModifier: ViewModifier {
    @Binding var attachments: [ComposerAttachment]
    @State private var piece: ComposerRetouchPiece?

    func body(content: Content) -> some View {
        content
            .environment(\.commentRetouch, CommentRetouchAction(open: open))
            .fullScreenCover(item: $piece) { piece in
                ConversationPieceRetouch(piece: piece, onDone: { media in
                    self.piece = nil
                    replace([ComposerRetouchedPiece(attachmentId: piece.attachmentId, media: media)])
                }, onRemove: {
                    self.piece = nil
                    attachments.removeAll { $0.id == piece.attachmentId }
                }, onCancel: { self.piece = nil })
            }
    }

    private func open(_ focusId: String) {
        guard let choisie = CommentSceneRetouch.candidates(attachments).first(where: { $0.attachmentId == focusId })
        else { return }
        HapticFeedback.light()
        piece = choisie
    }

    private func replace(_ rendues: [ComposerRetouchedPiece]) {
        Task {
            for rendue in rendues {
                guard let fichier = await Self.file(of: rendue.media) else {
                    FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
                    continue
                }
                guard let rendu = CommentSceneRetouch.replacing(attachments, id: rendue.attachmentId,
                                                                with: fichier.url, size: fichier.size) else {
                    try? FileManager.default.removeItem(at: fichier.url)
                    continue
                }
                attachments = rendu.attachments
                if let stale = rendu.stale { try? FileManager.default.removeItem(at: stale) }
            }
        }
    }

    /// **Écriture SÛRE** (#8524) : une image n'entre au plateau qu'écrite et
    /// vérifiée ; sinon la pièce d'origine reste celle qui partira.
    private static func file(of media: ComposerReturnedMedia) async -> (url: URL, size: Int?)? {
        switch media {
        case .image(let image):
            return await ConversationImageRetouche.writeEdited(image).map { ($0.url, $0.byteCount) }
        case .video(let url):
            return (url, (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize)
        }
    }
}

private struct CommentRecentMediaSceneModifier: ViewModifier {
    @Binding var image: UIImage?
    @Binding var video: URL?
    let onDone: (RecentMediaPick) -> Void

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding(get: { image != nil }, set: { if !$0 { image = nil } })) {
                if let image {
                    ConversationPieceRetouch(source: .image(image), onDone: { media in
                        self.image = nil
                        onDone(Self.pick(media))
                    }, onRemove: { self.image = nil }, onCancel: { self.image = nil })
                }
            }
            .fullScreenCover(isPresented: Binding(get: { video != nil }, set: { if !$0 { video = nil } })) {
                if let video {
                    ConversationPieceRetouch(source: .video(video), onDone: { media in
                        self.video = nil
                        onDone(Self.pick(media))
                    }, onRemove: { self.video = nil }, onCancel: { self.video = nil })
                }
            }
    }

    private static func pick(_ media: ComposerReturnedMedia) -> RecentMediaPick {
        switch media {
        case .image(let image): return .image(image)
        case .video(let url): return .video(url)
        }
    }
}
