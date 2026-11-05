import Foundation

// MARK: - Le fichier local d'une pièce suit le conteneur de l'app (#15294)
//
// Une bulle en attente désigne la copie que l'outbox garde sous
// `Documents/pending-media/` ou `pending-audio/`, par une URL `file://`
// ABSOLUE écrite dans `attachmentsJson`. Le dossier `…/Data/Application/<UUID>/`
// change quand l'app est mise à jour, restaurée ou réinstallée : la ligne relue
// visait l'ANCIEN conteneur, et la bulle perdait son aperçu alors que la copie
// était bien là. Même doctrine que `StoryMediaReference` (#14879) et que les
// cartes du fil en attente (#15095) : le format écrit ne change pas, chaque
// décodage rebase — les lignes déjà écrites guérissent donc sans migration.

/// Rebase d'une URL de fichier sur le conteneur courant. Une URL distante, un
/// fichier hors conteneur ou déjà sous `home` restent tels quels.
public enum ContainerFileURLRebase {
    public static func rebased(_ raw: String, ontoHome home: String = NSHomeDirectory()) -> String {
        guard raw.hasPrefix("file://"), let url = URL(string: raw), url.isFileURL else { return raw }
        let path = StoryMediaReference.rebasing(url.path, ontoHome: home)
        return path == url.path ? raw : URL(fileURLWithPath: path).absoluteString
    }
}

/// `fileUrl` d'une pièce, rebasé au décodage.
@propertyWrapper
public struct ContainerRebasedFileURL: Codable, Sendable, Hashable {
    public var wrappedValue: String

    public init(wrappedValue: String) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: Decoder) throws {
        wrappedValue = ContainerFileURLRebase.rebased(try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

/// `thumbnailUrl` d'une pièce, rebasé au décodage : la vignette d'une image
/// optimiste est le fichier lui-même. Clé absente ou nulle ⇒ `nil`, et `nil`
/// ne s'écrit pas — la forme des blobs ne change pas.
@propertyWrapper
public struct ContainerRebasedOptionalFileURL: Codable, Sendable, Hashable {
    public var wrappedValue: String?

    public init(wrappedValue: String?) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = container.decodeNil() ? nil : ContainerFileURLRebase.rebased(try container.decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

public extension KeyedDecodingContainer {
    func decode(_ type: ContainerRebasedOptionalFileURL.Type, forKey key: Key) throws -> ContainerRebasedOptionalFileURL {
        try decodeIfPresent(type, forKey: key) ?? ContainerRebasedOptionalFileURL(wrappedValue: nil)
    }
}

public extension KeyedEncodingContainer {
    mutating func encode(_ value: ContainerRebasedOptionalFileURL, forKey key: Key) throws {
        guard let url = value.wrappedValue else { return }
        try encode(url, forKey: key)
    }
}
