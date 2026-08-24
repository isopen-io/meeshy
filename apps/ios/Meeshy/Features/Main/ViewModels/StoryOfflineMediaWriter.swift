import Foundation
import UIKit
import os
import MeeshySDK

/// Écrit sur disque les médias d'une story mise en file de publication, et dit
/// LESQUELS n'ont pas pu l'être.
///
/// La copie existait déjà, mais chaque écriture passait par un `try?` nu : un
/// échec (disque plein, source disparue, destination inaccessible) était avalé
/// **et la référence était ajoutée quand même**. La story partait en file, on
/// annonçait à l'auteur « publication au retour en ligne », puis au drain le
/// contrôle d'existence la faisait échouer DÉFINITIVEMENT en
/// `.missingLocalMedia`. Le travail était perdu, longtemps après, sans que
/// rien n'ait signalé quoi que ce soit au moment où c'était réparable.
///
/// Ici, une écriture ratée ne produit jamais de référence fantôme : elle
/// remonte dans `failedElementIds`, à charge pour l'appelant de renoncer
/// plutôt que de promettre une publication impossible.
nonisolated enum StoryOfflineMediaWriter {

    struct Outcome {
        let references: [StoryMediaReference]
        let failedElementIds: [String]

        var isComplete: Bool { failedElementIds.isEmpty }
    }

    /// Qualité d'encodage des images — identique à celle du chemin d'origine.
    static let jpegQuality: CGFloat = 0.85

    /// `alphaPreservingIds` : les éléments dont l'image est DÉTOURÉE — un
    /// sticker importé. Le JPEG n'a pas de canal alpha ; réencoder un sticker
    /// ainsi aplatit sa transparence, et c'est ce fichier-là que le drain
    /// téléverse ensuite en `PostMedia`. L'appelant les nomme explicitement :
    /// aucune heuristique sur les pixels ne décide à sa place, et le fond de
    /// slide plein écran reste en JPEG plutôt que de faire enfler le dossier
    /// de file.
    static func persist(images: [String: UIImage],
                        videos: [String: URL],
                        audios: [String: URL],
                        into directory: URL,
                        alphaPreservingIds: Set<String> = [],
                        fileManager: FileManager = .default) -> Outcome {
        var references: [StoryMediaReference] = []
        var failed: [String] = []

        // Ordre déterministe : deux appels sur les mêmes entrées produisent la
        // même liste, ce qui rend les échecs reproductibles et testables.
        for id in images.keys.sorted() {
            guard let image = images[id] else { continue }
            let preservesAlpha = alphaPreservingIds.contains(id)
            let destination = directory.appendingPathComponent("\(id).\(preservesAlpha ? "png" : "jpg")")
            guard let data = preservesAlpha
                    ? image.pngData()
                    : image.jpegData(compressionQuality: jpegQuality) else {
                failed.append(id)
                continue
            }
            do {
                try data.write(to: destination, options: .atomic)
                references.append(StoryMediaReference(elementId: id, mediaType: "image",
                                                      localFilePath: destination.path))
            } catch {
                Logger.stories.error(
                    "offline.media.write failed element=\(id, privacy: .public) reason=\(error.localizedDescription, privacy: .public)")
                failed.append(id)
            }
        }

        for (id, reference) in copy(videos, mediaType: "video", defaultExtension: "mp4",
                                    into: directory, fileManager: fileManager) {
            if let reference { references.append(reference) } else { failed.append(id) }
        }

        for (id, reference) in copy(audios, mediaType: "audio", defaultExtension: "m4a",
                                    into: directory, fileManager: fileManager) {
            if let reference { references.append(reference) } else { failed.append(id) }
        }

        return Outcome(references: references, failedElementIds: failed.sorted())
    }

    private static func copy(_ sources: [String: URL],
                             mediaType: String,
                             defaultExtension: String,
                             into directory: URL,
                             fileManager: FileManager) -> [(String, StoryMediaReference?)] {
        sources.keys.sorted().map { id in
            guard let source = sources[id] else { return (id, nil) }
            let ext = source.pathExtension.isEmpty ? defaultExtension : source.pathExtension
            let destination = directory.appendingPathComponent("\(id).\(ext)")
            do {
                // `copyItem` échoue si la destination existe déjà — un
                // ré-enfilage sur le même dossier laisserait sinon la première
                // copie, potentiellement périmée.
                if fileManager.fileExists(atPath: destination.path) {
                    try fileManager.removeItem(at: destination)
                }
                try fileManager.copyItem(at: source, to: destination)
                return (id, StoryMediaReference(elementId: id, mediaType: mediaType,
                                                localFilePath: destination.path))
            } catch {
                Logger.stories.error(
                    "offline.media.copy failed element=\(id, privacy: .public) type=\(mediaType, privacy: .public) reason=\(error.localizedDescription, privacy: .public)")
                return (id, nil)
            }
        }
    }
}
