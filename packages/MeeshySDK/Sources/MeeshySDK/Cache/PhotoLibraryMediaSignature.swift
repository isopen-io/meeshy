import CryptoKit
import Foundation

/// **L'empreinte d'un média, la même quel que soit le chemin qui l'enregistre**
/// (#10370, directive porteur 2026-10-12 : « chercher par signature si le média
/// existe dans le dossier Meeshy, si oui signaler, sinon enregistrer »).
///
/// L'empreinte est celle du CONTENU (SHA-256 tronqué à 128 bits), pas d'un
/// identifiant : l'enregistrement automatique, la visionneuse, le lecteur plein
/// écran et le menu d'un message lisent tous le même fichier du cache, mais seuls
/// certains connaissent l'identifiant de la pièce. Une empreinte de contenu est
/// aussi la seule qui survive à une réinstallation sans rien demander au serveur.
///
/// Elle voyage dans le nom d'origine de l'asset (`PHAssetResource.originalFilename`,
/// voir `markedFileName`) : c'est la marque qui permet de retrouver, après une
/// réinstallation qui a effacé le registre, ce que l'album Meeshy contient déjà.
public struct PhotoLibraryMediaSignature: Hashable, Sendable, CustomStringConvertible {

    public let token: String

    static let tokenLength = 32
    static let markSeparator = "_mx"
    private static let readChunk = 1 << 20

    public init?(token: String) {
        let lowered = token.lowercased()
        guard lowered.count == Self.tokenLength,
              lowered.allSatisfy({ $0.isHexDigit }) else { return nil }
        self.token = lowered
    }

    public init(data: Data) {
        self.token = Self.token(of: SHA256.hash(data: data))
    }

    /// Lit le fichier par blocs : une vidéo de plusieurs centaines de Mo ne passe
    /// jamais entière en mémoire. Hors de l'acteur appelant (`@concurrent`) : le
    /// hachage d'une vidéo ne gèle pas l'interface.
    @concurrent
    public static func of(fileAt url: URL) async throws -> PhotoLibraryMediaSignature {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: readChunk), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return PhotoLibraryMediaSignature(digestToken: token(of: hasher.finalize()))
    }

    private init(digestToken: String) {
        self.token = digestToken
    }

    private static func token(of digest: SHA256.Digest) -> String {
        String(digest.map { String(format: "%02x", $0) }.joined().prefix(tokenLength))
    }

    public var description: String { token }

    // MARK: - La marque recouvrable

    /// Le nom d'origine que l'asset porte dans Photos : `<base>_mx<empreinte>.<ext>`.
    /// La base garde le nom lisible choisi par l'appelant (« Meeshy » par défaut).
    public func markedFileName(base: String?, pathExtension: String) -> String {
        let cleaned = (base ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let stem = cleaned.isEmpty ? "Meeshy" : (cleaned as NSString).deletingPathExtension
        let name = "\(stem)\(Self.markSeparator)\(token)"
        return pathExtension.isEmpty ? name : "\(name).\(pathExtension)"
    }

    /// L'empreinte qu'un nom d'origine porte, ou `nil` pour tout nom qui n'a pas
    /// été posé par `markedFileName` (une photo de l'appareil rangée à la main
    /// dans l'album, un enregistrement antérieur à la marque).
    public static func parse(markedFileName: String) -> PhotoLibraryMediaSignature? {
        let stem = (markedFileName as NSString).deletingPathExtension
        guard let range = stem.range(of: markSeparator, options: .backwards) else { return nil }
        let candidate = stem[range.upperBound...]
        guard candidate.count == tokenLength else { return nil }
        return PhotoLibraryMediaSignature(token: String(candidate))
    }
}
