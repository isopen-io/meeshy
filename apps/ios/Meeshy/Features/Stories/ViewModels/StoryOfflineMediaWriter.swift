import Foundation
import UIKit
import CryptoKit
import os
import MeeshySDK
import MeeshyUI

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

    /// La famille d'un média : c'est elle qu'on NOMME à l'auteur quand un
    /// élément ne peut vraiment pas être gardé (#10495).
    enum MediaKind: String, Sendable {
        case image, video, audio
    }

    struct Failure: Equatable {
        let elementId: String
        let kind: MediaKind
    }

    struct Outcome {
        let references: [StoryMediaReference]
        let failures: [Failure]

        var failedElementIds: [String] { failures.map(\.elementId) }
        var isComplete: Bool { failures.isEmpty }
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
                        animations: [String: Data] = [:],
                        fileManager: FileManager = .default) -> Outcome {
        var references: [StoryMediaReference] = []
        var failed: [Failure] = []
        // Une pré-montée adoptée range la MÊME image sous trois clés (objet,
        // `postMediaId`, adresse) : elle ne s'encode qu'une fois.
        var encodings: [ObjectIdentifier: Data] = [:]

        // Ordre déterministe : deux appels sur les mêmes entrées produisent la
        // même liste, ce qui rend les échecs reproductibles et testables.
        for id in images.keys.sorted() {
            guard let image = images[id] else { continue }
            let preservesAlpha = alphaPreservingIds.contains(id)
            // **Les octets ANIMÉS d'un sticker traversent la file tels quels**
            // (#8522, #3956). Aplatir un GIF en PNG ici publierait au rejeu un
            // sticker figé que l'auteur avait composé animé.
            let animated = preservesAlpha
                ? animations[id].flatMap { bytes in
                    AnimatedImageEligibility.container(bytes).map { (bytes, $0.filenameExtension) }
                }
                : nil
            let ext = animated?.1 ?? (preservesAlpha ? "png" : "jpg")
            let destination = directory.appendingPathComponent("\(fileStem(for: id)).\(ext)")
            let reused = preservesAlpha ? nil : encodings[ObjectIdentifier(image)]
            guard let data = animated?.0 ?? reused ?? encoded(image, preservesAlpha: preservesAlpha) else {
                Logger.stories.error(
                    "offline.media.encode failed element=\(id, privacy: .public) size=\(Double(image.size.width), privacy: .public)x\(Double(image.size.height), privacy: .public)")
                failed.append(Failure(elementId: id, kind: .image))
                continue
            }
            if !preservesAlpha, animated == nil { encodings[ObjectIdentifier(image)] = data }
            do {
                try data.write(to: destination, options: .atomic)
                references.append(StoryMediaReference(elementId: id, mediaType: "image",
                                                      localFilePath: destination.path))
            } catch {
                Logger.stories.error(
                    "offline.media.write failed element=\(id, privacy: .public) reason=\(error.localizedDescription, privacy: .public)")
                failed.append(Failure(elementId: id, kind: .image))
            }
        }

        for (id, reference) in copy(videos, mediaType: "video", defaultExtension: "mp4",
                                    into: directory, fileManager: fileManager) {
            if let reference { references.append(reference) } else { failed.append(Failure(elementId: id, kind: .video)) }
        }

        for (id, reference) in copy(audios, mediaType: "audio", defaultExtension: "m4a",
                                    into: directory, fileManager: fileManager) {
            if let reference { references.append(reference) } else { failed.append(Failure(elementId: id, kind: .audio)) }
        }

        return Outcome(references: references,
                       failures: failed.sorted { $0.elementId < $1.elementId })
    }

    /// **Une CLÉ n'est jamais un CHEMIN** (#10495).
    ///
    /// Les dictionnaires du composer ne sont pas indexés que par des ids
    /// d'objet : l'adoption d'une pré-montée (#8540) range aussi l'image sous
    /// son ADRESSE DISTANTE. Nommer le fichier par la clé écrivait donc dans
    /// `<dossier>/https:/gate…/x.jpg.jpg` — des dossiers qui n'existent pas —,
    /// l'écriture levait, et toute publication EN LIGNE dont une pré-montée
    /// avait fini affichait « Impossible d'enregistrer les médias ».
    ///
    /// Une clé qui est déjà un nom de fichier sûr le reste (les noms d'hier ne
    /// changent pas) ; toute autre devient son empreinte SHA-256. La référence,
    /// elle, garde la clé d'origine : le rejeu relit `elementId`, jamais le nom.
    static func fileStem(for id: String) -> String {
        let allowed = CharacterSet(charactersIn:
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")
        let isSafe = !id.isEmpty && id.utf8.count <= 128
            && !id.hasPrefix(".")
            && id.unicodeScalars.allSatisfy { allowed.contains($0) }
        guard !isSafe else { return id }
        return SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Les octets d'une image, et un REDESSIN quand UIKit refuse de l'encoder
    /// telle quelle — une image adossée à une `CIImage`, ou dans un format de
    /// pixels que l'encodeur ne prend pas. Seule une image sans surface (0×0)
    /// reste un échec : il n'y a rien à redessiner.
    static func encoded(_ image: UIImage, preservesAlpha: Bool) -> Data? {
        let direct = preservesAlpha ? image.pngData() : image.jpegData(compressionQuality: jpegQuality)
        if let direct { return direct }
        guard image.size.width > 0, image.size.height > 0 else { return nil }
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = image.scale
        format.opaque = !preservesAlpha
        format.preferredRange = .standard
        let redrawn = UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
        return preservesAlpha ? redrawn.pngData() : redrawn.jpegData(compressionQuality: jpegQuality)
    }

    private static func copy(_ sources: [String: URL],
                             mediaType: String,
                             defaultExtension: String,
                             into directory: URL,
                             fileManager: FileManager) -> [(String, StoryMediaReference?)] {
        sources.keys.sorted().map { id in
            guard let source = sources[id] else { return (id, nil) }
            let ext = source.pathExtension.isEmpty ? defaultExtension : source.pathExtension
            let destination = directory.appendingPathComponent("\(fileStem(for: id)).\(ext)")
            // Un fichier remis par le sélecteur de documents peut être
            // « security-scoped » : sans accès ouvert, la copie est refusée.
            let scoped = source.startAccessingSecurityScopedResource()
            defer { if scoped { source.stopAccessingSecurityScopedResource() } }
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
