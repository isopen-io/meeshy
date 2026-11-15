import Foundation

/// **Le nom de la copie temporaire d'un fichier importé, et le nom choisi qu'il
/// contient** (#11166).
///
/// Un fichier choisi dans l'importateur est copié dans notre conteneur sous un
/// nom unique. Ce nom est une affaire de disque : il ne doit jamais devenir le
/// `originalName` que l'aperçu de liste et la bulle affichent. Écriture et
/// lecture vivent ici pour qu'une porte ne puisse pas écrire un préfixe que la
/// lecture ignore.
public nonisolated enum ImportedCopyName {

    public enum Door: String, CaseIterable, Sendable {
        case conversationFile = "file"
        case composerDocument = "composer_file"
        case composerSound = "composer_sound"
        case commentFile = "comment"
        case paste
        case drop
    }

    public static func copyName(of chosenName: String, through door: Door) -> String {
        "\(door.rawValue)_\(UUID().uuidString)_\(chosenName)"
    }

    /// Le nom choisi porté par `copyName`, ou `nil` si ce n'est pas une copie. Un
    /// fichier reçu sous un nom hérité puis réimporté porte deux préfixes : les
    /// deux tombent.
    public static func chosenName(in copyName: String) -> String? {
        guard let peeled = Door.allCases.lazy.compactMap({ chosenName(in: copyName, after: $0) }).first else { return nil }
        return chosenName(in: peeled) ?? peeled
    }

    /// Les noms choisis alignés sur `urls`, ou `nil` si aucune n'est une copie.
    public static func chosenNames(of urls: [URL]) -> [String?]? {
        let names = urls.map { chosenName(in: $0.lastPathComponent) }
        return names.contains { $0 != nil } ? names : nil
    }

    private static func chosenName(in copyName: String, after door: Door) -> String? {
        guard copyName.hasPrefix("\(door.rawValue)_") else { return nil }
        let afterDoor = copyName.dropFirst(door.rawValue.count + 1)
        let uuidLength = 36
        let uuid = afterDoor.prefix(uuidLength)
        let afterUUID = afterDoor.dropFirst(uuidLength)
        guard UUID(uuidString: String(uuid)) != nil, afterUUID.first == "_", afterUUID.count > 1 else { return nil }
        return String(afterUUID.dropFirst())
    }
}
