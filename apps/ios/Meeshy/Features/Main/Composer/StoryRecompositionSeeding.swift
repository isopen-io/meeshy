import UIKit
import MeeshySDK
import MeeshyUI

/// **Ce qu'une story reprise devient quand « Composer » la sème** (#9994).
///
/// `StoryRecomposition` (SDK, pure) dit QUELS médias la scène emporte et sous
/// quelle identité ; ce site les rapatrie — cache typé, sinon réseau, par
/// `MediaSaveSourceResolving` comme la porte d'un média seul — puis remet le tout
/// à `StoryComposerSeed.scene`. Les téléchargements partent ENSEMBLE : une story
/// à quatre médias ne doit pas attendre quatre allers-retours à la file.
///
/// Les images sont décodées au plafond de 1080 px du composer, hors du main
/// actor (`StoryMediaLoader`) ; vidéos et sons restent des FICHIERS, que la
/// fabrique copie.
///
/// `nil` dès qu'un média de la scène ne se rapatrie pas : la porte se referme
/// alors en le disant, plutôt que d'ouvrir une scène amputée.
enum StoryRecompositionSeeding {

    @MainActor
    static func seed(for recomposition: StoryRecomposition,
                     resolver: MediaSaveSourceResolving) async -> StoryComposerSeed? {
        let local = await localFiles(for: recomposition.assets, resolver: resolver)

        var images: [String: UIImage] = [:]
        var files: [String: URL] = [:]
        for asset in recomposition.assets {
            guard let file = local[asset.objectId] else { continue }
            switch asset.kind {
            case .video, .audio:
                files[asset.objectId] = file
            case .backgroundImage, .image, .stickerImage:
                guard let data = try? Data(contentsOf: file, options: .mappedIfSafe),
                      let bitmap = await StoryMediaLoader.shared.loadImage(data: data, maxDimension: 1080)
                else { continue }
                images[asset.objectId] = bitmap
            }
        }
        return StoryComposerSeed.scene(recomposition, images: images, files: files)
    }

    /// Les fichiers locaux, par identifiant d'objet. Un média introuvable est
    /// simplement ABSENT de la carte : c'est la fabrique de la graine qui décide
    /// s'il manque (un média, un son) ou s'il se passe de lui (l'image d'un
    /// sticker, que son emoji remplace).
    private static func localFiles(for assets: [StoryRecomposition.Asset],
                                   resolver: MediaSaveSourceResolving) async -> [String: URL] {
        await withTaskGroup(of: (String, URL?).self) { group in
            for asset in assets {
                let request = MediaSaveRequest(kind: attachmentKind(asset.kind),
                                               origin: .transmitted,
                                               remoteURLString: asset.remoteURL)
                group.addTask {
                    let file = try? await resolver.resolveLocalFile(for: request)
                    return (asset.objectId, file)
                }
            }
            var files: [String: URL] = [:]
            for await (objectId, file) in group {
                if let file { files[objectId] = file }
            }
            return files
        }
    }

    private static func attachmentKind(_ kind: StoryRecomposition.AssetKind) -> AttachmentKind {
        switch kind {
        case .backgroundImage, .image, .stickerImage: return .image
        case .video: return .video
        case .audio: return .audio
        }
    }
}
