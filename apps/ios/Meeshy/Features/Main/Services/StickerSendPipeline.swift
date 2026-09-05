import Foundation
import UIKit

// MARK: - Ce que la préparation d'un sticker peut refuser

/// Le seul refus qui vienne du pipeline lui-même : `pngData()` rend `nil`, pas
/// une erreur, et un envoi qui s'arrêterait là sans rien dire laisserait la
/// bulle optimiste en attente pour toujours.
nonisolated enum StickerSendPipelineError: Error, Equatable, Sendable {
    case encodingFailed
}

// MARK: - Le PNG d'un sticker, hors du fil principal

/// **Ce qu'un sticker coûte APRÈS que sa bulle est apparue** (#4947).
///
/// L'envoi encodait le PNG puis l'écrivait sur le disque AVANT de poser la
/// bulle optimiste : deux opérations synchrones sur le fil principal — un
/// `pngData()` de 512 pt à 2× puis une écriture — entre le tap et le premier
/// pixel. L'image, elle, est DÉJÀ rasterisée au moment du tap : rien
/// n'obligeait la bulle à attendre ses octets.
///
/// La bulle part donc en premier, l'image amorcée dans le cache d'aperçu ;
/// l'encodage et l'écriture suivent hors du fil principal, par ces fonctions
/// PURES — une entrée, une sortie, aucun état — que les témoins mesurent sans
/// simulateur.
///
/// Le nom du fichier se calcule AVANT l'écriture (`fileURL(id:in:)`) : la bulle
/// optimiste porte cette URL locale comme `fileUrl` et le cache d'aperçu est
/// amorcé sous la même clé. Sans cette séparation, la bulle ne pourrait pas
/// être posée avant que le fichier existe.
nonisolated enum StickerSendPipeline {

    /// Le fichier écrit ET ses octets : l'upload et le cache disque les
    /// réutilisent, les relire depuis le disque serait une seconde lecture
    /// pour rien.
    nonisolated struct WrittenSticker: Sendable {
        let url: URL
        let data: Data
    }

    /// Le nom de fichier d'un sticker, dérivé de l'id de la pièce jointe :
    /// stable, donc le même id nomme le même fichier avant et après
    /// l'écriture.
    nonisolated static func fileName(for attachmentId: String) -> String {
        "sticker_\(attachmentId).png"
    }

    /// L'URL qu'aura le fichier — connue avant qu'il existe, c'est ce qui
    /// permet de poser la bulle en premier.
    nonisolated static func fileURL(id attachmentId: String, in directory: URL) -> URL {
        directory.appendingPathComponent(fileName(for: attachmentId))
    }

    /// Les octets PNG d'une image déjà rasterisée. `nil` — jamais des octets
    /// vides — pour que l'appelant distingue « rien à envoyer » d'un fichier à
    /// zéro octet.
    nonisolated static func encode(_ image: UIImage) -> Data? {
        image.pngData()
    }

    /// Écrit les octets sous le nom du sticker et rend l'URL du fichier.
    ///
    /// Écriture ATOMIQUE : l'upload lit ce fichier depuis une autre tâche, et
    /// un fichier à moitié écrit partirait comme un PNG tronqué. L'erreur
    /// remonte telle quelle (répertoire absent, disque plein) — c'est elle qui
    /// fait basculer la bulle en échec plutôt que de la laisser tourner.
    nonisolated static func write(_ data: Data, id attachmentId: String, directory: URL) throws -> URL {
        let url = fileURL(id: attachmentId, in: directory)
        try data.write(to: url, options: .atomic)
        return url
    }

    /// Encode puis écrit, HORS du fil principal.
    ///
    /// La boîte `@unchecked Sendable` suit la discipline d'`ImageCompressor` :
    /// l'`UIImage` n'est que LUE (encodage des pixels), jamais mutée, donc la
    /// faire traverser vers une tâche détachée est sûr — et c'est la seule
    /// façon de sortir un encodage CPU du fil qui doit rester libre pour le
    /// scroll et la frappe.
    @MainActor
    static func prepare(_ image: UIImage,
                        id attachmentId: String,
                        directory: URL) async throws -> WrittenSticker {
        let boîte = SendableStickerImage(image: image)
        return try await Task.detached(priority: .userInitiated) {
            guard let data = StickerSendPipeline.encode(boîte.image) else {
                throw StickerSendPipelineError.encodingFailed
            }
            let url = try StickerSendPipeline.write(data, id: attachmentId, directory: directory)
            return WrittenSticker(url: url, data: data)
        }.value
    }
}

/// La traversée d'une `UIImage` vers une tâche détachée — même boîte, même
/// raison qu'`ImageCompressor.SendableImageBox` (l'image est lue, jamais
/// mutée). Elle est redite ici plutôt qu'exportée : une boîte publique
/// inviterait à faire voyager n'importe quelle image, y compris une image
/// qu'on mute.
private nonisolated struct SendableStickerImage: @unchecked Sendable {
    let image: UIImage
}
