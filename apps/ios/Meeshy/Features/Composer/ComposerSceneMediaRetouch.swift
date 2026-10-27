import SwiftUI
import MeeshySDK
import MeeshyUI

// **« Modifier » une image ou une vidéo de la scène ouvre LA retouche** (#12590, décision
// porteur 2026-10-20 : « un seul éditeur » — #11133, #11152). Le modèle le disait déjà
// (`meeshy-composer-modele.md` § 5 : « l'objet a un éditeur ») et le son ouvrait bien le
// sien ; l'image et la vidéo ouvraient des sous-outils en place, donc un éditeur parallèle.
//
// La règle est pure (`ComposerSceneMediaRetouchRule`) ; la couverture présente
// `ConversationPieceRetouch`, la même que la conversation, les commentaires et le fil ;
// « Terminé » remplace le média À SA PLACE (`ComposerMediaSwapRun`). « Abandonner » et (x)
// referment sans rien changer : ils ne retirent JAMAIS le média du studio.

/// Ce que la scène sait d'un média pour décider s'il s'ouvre en retouche.
nonisolated struct ComposerSceneMediaFacts: Equatable {
    let isVideo: Bool
    let mediaURL: String?
    let adoptedLocalURL: URL?
    let loadedVideoURL: URL?
    let hasBitmap: Bool
}

nonisolated enum ComposerSceneMediaRetouchRule {

    /// D'où la retouche lit le média.
    enum Origin: Equatable {
        case file(URL)
        case bitmap
    }

    /// **Le fichier d'abord** — à sa définition native —, puis l'alias local d'un média
    /// pré-monté, puis la vidéo chargée, puis le bitmap en mémoire (une image seulement).
    /// `nil` : le média n'a aucune source locale (un média distant sans fichier), il garde
    /// l'édition en place — la loi 4, on n'offre pas ce qui n'a pas d'effet.
    static func origin(_ facts: ComposerSceneMediaFacts) -> Origin? {
        if let url = facts.mediaURL.flatMap(URL.init(string:)), url.isFileURL { return .file(url) }
        if let url = facts.adoptedLocalURL { return .file(url) }
        if facts.isVideo { return facts.loadedVideoURL.map(Origin.file) }
        return facts.hasBitmap ? .bitmap : nil
    }

    static func offers(_ facts: ComposerSceneMediaFacts) -> Bool {
        origin(facts) != nil
    }
}

/// La demande de retouche d'un média de la scène.
struct ComposerSceneMediaRetouchRequest: Identifiable {
    let objectId: String
    let source: ConversationRetouchSource
    var id: String { objectId }
}

@MainActor
enum ComposerSceneMediaRetouch {

    static func facts(for objectId: String, in viewModel: StoryComposerViewModel) -> ComposerSceneMediaFacts? {
        guard let media = viewModel.currentSlide.effects.mediaObjects?.first(where: { $0.id == objectId }) else { return nil }
        return ComposerSceneMediaFacts(
            isVideo: media.mediaType == StoryMediaKind.video.rawValue,
            mediaURL: media.mediaURL,
            adoptedLocalURL: viewModel.adoptedLocalMedia[media.postMediaId],
            loadedVideoURL: viewModel.loadedVideoURLs[objectId],
            hasBitmap: viewModel.loadedImages[objectId] != nil)
    }

    /// La demande à présenter, ou `nil` : le média garde alors son édition en place.
    static func request(for objectId: String, in viewModel: StoryComposerViewModel) -> ComposerSceneMediaRetouchRequest? {
        guard let faits = facts(for: objectId, in: viewModel), let origine = ComposerSceneMediaRetouchRule.origin(faits) else {
            return nil
        }
        switch origine {
        case .file(let url):
            let genre: ComposerRetouchPiece.Kind = faits.isVideo ? .video : .image
            let piece = ComposerRetouchPiece(attachmentId: objectId, fileURL: url,
                                             mimeType: MimeTypeResolver.mimeType(forURL: url), kind: genre)
            return ComposerSceneMediaRetouchRequest(objectId: objectId, source: .piece(piece))
        case .bitmap:
            return viewModel.loadedImages[objectId].map {
                ComposerSceneMediaRetouchRequest(objectId: objectId, source: .image($0))
            }
        }
    }

    /// Le média que « Terminé » rend, écrit sous `<nouvel id>.<ext>` — la convention qui relie
    /// un bitmap à sa clé de canvas —, prêt pour le document ET pour la scène.
    static func delivery(of media: ComposerReturnedMedia, objectId: String) async -> ComposerReturnedFile? {
        switch media {
        case .image(let image):
            let (octets, suffixe) = ComposerCapturePayload.bytes(original: nil, fallback: image)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(objectId).\(suffixe)")
            guard let octets, (try? octets.write(to: url)) != nil else { return nil }
            return ComposerReturnedFile(
                media: ComposerDocumentMediaFactory.media(url: url, declaredMimeType: ComposerCapturePayload.mime(for: suffixe)),
                source: .image(image, fileURL: url))
        case .video(let url):
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(objectId).\(url.pathExtension.isEmpty ? "mov" : url.pathExtension)")
            try? FileManager.default.removeItem(at: destination)
            guard (try? FileManager.default.moveItem(at: url, to: destination)) != nil else { return nil }
            let mime = MimeTypeResolver.mimeType(forURL: destination)
            let duree = await ComposerMediaProbe.durationMs(forURL: destination, mime: mime)
            return ComposerReturnedFile(
                media: ComposerDocumentMediaFactory.media(url: destination, declaredMimeType: mime, durationMs: duree),
                source: .video(destination, thumbnail: nil, aspectRatio: nil, duration: duree.map { Float($0) / 1000 }))
        }
    }
}

/// La couverture plein écran de la retouche d'un média de la scène.
struct ComposerSceneMediaRetouchCover: ViewModifier {
    @Binding var request: ComposerSceneMediaRetouchRequest?
    let onDone: (String, ComposerReturnedMedia) -> Void

    func body(content: Content) -> some View {
        content.fullScreenCover(item: $request) { demande in
            ConversationPieceRetouch(source: demande.source, onDone: { media in
                request = nil
                onDone(demande.objectId, media)
            }, onRemove: { request = nil }, onCancel: { request = nil })
        }
    }
}
