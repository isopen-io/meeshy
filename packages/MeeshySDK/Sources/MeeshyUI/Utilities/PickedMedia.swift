import Foundation
import CoreTransferable
import PhotosUI
import UniformTypeIdentifiers

// **L'UNIQUE site d'ingestion d'un élément du sélecteur de photothèque** (#9870).
//
// `loadTransferable(type: Data.self)` suivi de `data.write(to:)` faisait traverser
// DEUX fois la mémoire à un film 4K de plusieurs centaines de Mo — et, avec le
// choix d'encodage `.automatic`, le système pouvait en plus le transcoder
// HEVC -> H.264 avant même de le livrer. Une vidéo entre désormais par un
// FICHIER : le système la remet par `FileRepresentation`, la fermeture la copie
// aussitôt dans le `tmp` de l'app (seule fenêtre où l'octet existe encore), et
// l'appelant ne reçoit qu'une URL. Aucun octet de la vidéo ne passe par la
// mémoire de l'app.
//
// Les sélecteurs qui acceptent des vidéos portent `preferredItemEncoding:
// .current` (l'équivalent SwiftUI de `PHPickerConfiguration
// .preferredAssetRepresentationMode = .current`) : sans lui, le fichier livré
// est déjà un transcodage. Une garde de source tient les deux
// (`PickedMediaIngestionGuardTests`).
//
// Une IMAGE reste un `Data` : son décodage la matérialise de toute façon, et la
// charger par `DataRepresentation(importedContentType: .image)` est le motif
// éprouvé. Ce qui change est qu'elle passe, elle aussi, par ce fichier — un
// seul endroit où lire « comment un média quitte la photothèque ».

/// La loi PURE de la copie : où le fichier reçu est posé, sous quel nom, avec
/// quelle extension. Testable sans photothèque.
public enum PickedMediaStaging {

    /// Le préfixe des fichiers posés : l'app le balaie du `tmp` au lancement
    /// (`TemporaryMediaSweeper`) — un import sans propriétaire ne s'y accumule pas.
    public static let filePrefix = "picked_"

    /// Copie `source` dans `directory` (le `tmp` de l'app par défaut) sous un nom
    /// unique. L'extension du conteneur reçu est GARDÉE (en minuscules) : avec
    /// `.current`, un `.mov` reste un `.mov`. Une copie ratée ne laisse aucun
    /// fichier derrière elle.
    public static func stage(
        _ source: URL,
        directory: URL = FileManager.default.temporaryDirectory,
        fallbackExtension: String = "mov",
        fileManager: FileManager = .default
    ) throws -> URL {
        let received = source.pathExtension.lowercased()
        let fileExtension = received.isEmpty ? fallbackExtension : received
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent("\(filePrefix)\(UUID().uuidString).\(fileExtension)")
        do {
            try fileManager.copyItem(at: source, to: destination)
        } catch {
            try? fileManager.removeItem(at: destination)
            throw error
        }
        return destination
    }

    /// Rebaptise un fichier déjà posé, dans son dossier : un déplacement, jamais
    /// une seconde copie. Le composer de story aligne l'identifiant de
    /// l'objet sur le nom `{stem}.<ext>` du fichier.
    public static func rename(
        _ staged: URL,
        toStem stem: String,
        fileManager: FileManager = .default
    ) throws -> URL {
        let destination = staged.deletingLastPathComponent()
            .appendingPathComponent(stem)
            .appendingPathExtension(staged.pathExtension)
        guard destination != staged else { return staged }
        try? fileManager.removeItem(at: destination)
        try fileManager.moveItem(at: staged, to: destination)
        return destination
    }

    public static func discard(_ staged: URL, fileManager: FileManager = .default) {
        try? fileManager.removeItem(at: staged)
    }
}

/// Une vidéo de la photothèque, déjà copiée dans le `tmp` de l'app.
public struct PickedMediaFile: Transferable, Sendable {
    public let url: URL

    public static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .movie) { received in
            try PickedMediaFile(url: PickedMediaStaging.stage(received.file))
        }
    }
}

/// Les octets d'une image de la photothèque.
public struct PickedImageData: Transferable, Sendable {
    public let data: Data

    public static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(importedContentType: .image) { data in
            PickedImageData(data: data)
        }
    }
}

public enum PickedMedia {

    /// Le fichier de la vidéo choisie, copié dans le `tmp` de l'app — l'appelant
    /// en devient propriétaire et le supprime quand il n'en a plus besoin.
    /// `stem` nomme le fichier `{stem}.<ext>` quand l'appelant doit l'aligner sur
    /// un identifiant. Hors du fil principal : la copie se fait dans la
    /// fermeture d'import du système.
    public static func loadVideoFile(_ item: PhotosPickerItem, stem: String? = nil) async throws -> URL? {
        guard let picked = try await item.loadTransferable(type: PickedMediaFile.self) else { return nil }
        guard let stem else { return picked.url }
        return try PickedMediaStaging.rename(picked.url, toStem: stem)
    }

    /// Les octets de l'image choisie.
    public static func loadImageData(_ item: PhotosPickerItem) async throws -> Data? {
        try await item.loadTransferable(type: PickedImageData.self)?.data
    }
}
