import Foundation

// MARK: - Les fichiers adressés par contenu (#10157)

/// **Un fichier de pack** — `PackAssetRef` du shared : `src` = les 16 premiers
/// caractères de son SHA-256 puis son extension, servi par
/// `GET /api/v1/pack-assets/<src>`. Fail-closed au décodage : une référence
/// qui ne s'adresse pas par son contenu ne se lit pas.
public struct PackAssetRef: Codable, Hashable, Sendable {
    public let src: String
    public let bytes: Int
    public let sha256: String

    public init?(src: String, bytes: Int, sha256: String) {
        guard bytes >= 0, PackAssetName.isContentAddressed(src),
              PackAssetName.isHex(sha256, count: 64), src.hasPrefix(String(sha256.prefix(16))) else { return nil }
        self.src = src
        self.bytes = bytes
        self.sha256 = sha256
    }

    enum CodingKeys: String, CodingKey { case src, bytes, sha256 }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let src = try c.decode(String.self, forKey: .src)
        let bytes = try c.decode(Int.self, forKey: .bytes)
        let sha256 = try c.decode(String.self, forKey: .sha256)
        guard let ref = PackAssetRef(src: src, bytes: bytes, sha256: sha256) else {
            throw DecodingError.dataCorruptedError(forKey: .src, in: c, debugDescription: "fichier de pack non adressé par contenu : \(src)")
        }
        self = ref
    }

    /// Une référence lue est déjà vérifiée : son fichier se nomme sans repasser la garde.
    public var file: PackAssetFile { PackAssetFile(verifiedName: src, sha256: sha256) }
}

/// **Ce qu'il faut pour lire un fichier de pack et le vérifier** : son nom, et
/// son empreinte entière quand on la connaît. La couverture d'un pack n'arrive
/// que par son adresse (`coverUrl`) : seul le préfixe de 16 caractères que
/// porte son nom peut alors être vérifié.
public struct PackAssetFile: Hashable, Sendable {
    public let name: String
    public let sha256: String?

    public init?(name: String, sha256: String? = nil) {
        guard PackAssetName.isContentAddressed(name) else { return nil }
        if let sha256, !(PackAssetName.isHex(sha256, count: 64) && name.hasPrefix(String(sha256.prefix(16)))) {
            return nil
        }
        self.name = name
        self.sha256 = sha256
    }

    fileprivate init(verifiedName: String, sha256: String) {
        self.name = verifiedName
        self.sha256 = sha256
    }

    /// Les 16 caractères hexadécimaux que le nom engage.
    public var namedPrefix: String { String(name.prefix(16)) }

    /// `/api/v1/pack-assets/<sha16>.webp` (ou son URL absolue) ⇒ le fichier ;
    /// toute autre adresse (un média de `/attachments`) ⇒ `nil`.
    public init?(servedPath: String?) {
        guard let servedPath, let path = URLComponents(string: servedPath)?.path else { return nil }
        let parts = path.split(separator: "/")
        guard parts.count >= 2, parts[parts.count - 2] == "pack-assets" else { return nil }
        self.init(name: String(parts[parts.count - 1]))
    }
}

enum PackAssetName {
    static let extensions: Set<String> = ["webp", "png", "json", "woff2"]

    static func isContentAddressed(_ name: String) -> Bool {
        let parts = name.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return false }
        return isHex(String(parts[0]), count: 16) && extensions.contains(String(parts[1]))
    }

    static func isHex(_ value: String, count: Int) -> Bool {
        value.count == count && value.allSatisfy { ("0"..."9").contains($0) || ("a"..."f").contains($0) }
    }
}

// MARK: - Un pack de cadres, servi par `/packs/glory-frame` (#10148)

public typealias PackStatus = StickerPackStatus

public struct PackLocalizedName: Codable, Hashable, Sendable {
    public let name: String
    public let description: String

    public init(name: String, description: String = "") {
        self.name = name
        self.description = description
    }

    enum CodingKeys: String, CodingKey { case name, description }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
    }
}

public struct FramePackCollection: Codable, Hashable, Sendable {
    public let slug: String
    public let usage: FrameUsage?

    enum CodingKeys: String, CodingKey { case slug, usage }

    public init(slug: String, usage: FrameUsage?) {
        self.slug = slug
        self.usage = usage
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        usage = try? c.decodeIfPresent(FrameUsage.self, forKey: .usage)
    }
}

/// **Un pack de cadres, résumé (boutique) ou détaillé** — `FramePackSummary` et
/// `FramePackDetail` de la passerelle en un seul type : le résumé est un détail
/// sans contrat. Tolérant champ par champ, sauf sur le slug ; l'usage illisible
/// se lit `nil` (le pack se montre, son libellé d'usage se tait).
public struct FramePack: InstallablePack {
    public let slug: String
    public let name: String
    public let description: String
    public let author: String
    public let isBuiltin: Bool
    public let status: PackStatus
    public let itemCount: Int
    /// RELATIF (`/api/v1/pack-assets/<sha16>.webp`) : à lire par `coverFile`.
    public let coverUrl: String?
    public var installed: Bool
    public var installCount: Int
    public let origin: PackOrigin
    public let version: Int
    public let removable: Bool
    public let names: [String: PackLocalizedName]
    public let preview: PackAssetRef?
    public let usage: FrameUsage?
    public let contractSchema: Int?
    public let contract: PackAssetRef?
    public let strings: [String: PackAssetRef]
    public let collections: [FramePackCollection]

    public var id: String { slug }
    public var isBundled: Bool { isBuiltin || origin == .builtin }
    public var coverFile: PackAssetFile? { PackAssetFile(servedPath: coverUrl) }

    public init(slug: String, name: String, description: String = "", author: String = "Meeshy",
                isBuiltin: Bool = false, status: PackStatus = .approved, itemCount: Int = 0,
                coverUrl: String? = nil, installed: Bool = false, installCount: Int = 0,
                origin: PackOrigin = .official, version: Int = 1, removable: Bool = true,
                names: [String: PackLocalizedName] = [:], preview: PackAssetRef? = nil,
                usage: FrameUsage? = nil, contractSchema: Int? = nil, contract: PackAssetRef? = nil,
                strings: [String: PackAssetRef] = [:], collections: [FramePackCollection] = []) {
        self.slug = slug
        self.name = name
        self.description = description
        self.author = author
        self.isBuiltin = isBuiltin
        self.status = status
        self.itemCount = itemCount
        self.coverUrl = coverUrl
        self.installed = installed
        self.installCount = installCount
        self.origin = origin
        self.version = version
        self.removable = removable
        self.names = names
        self.preview = preview
        self.usage = usage
        self.contractSchema = contractSchema
        self.contract = contract
        self.strings = strings
        self.collections = collections
    }

    enum CodingKeys: String, CodingKey {
        case slug, name, description, author, status, itemCount, coverUrl, installed, installCount
        case origin, version, removable, names, preview, usage, contractSchema, contract, strings, collections
        case isBuiltin = "builtin"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? slug
        description = (try? c.decodeIfPresent(String.self, forKey: .description)) ?? ""
        author = (try? c.decodeIfPresent(String.self, forKey: .author)) ?? ""
        isBuiltin = (try? c.decodeIfPresent(Bool.self, forKey: .isBuiltin)) ?? false
        status = (try? c.decodeIfPresent(PackStatus.self, forKey: .status)) ?? .unknown
        itemCount = (try? c.decodeIfPresent(Int.self, forKey: .itemCount)) ?? 0
        coverUrl = try? c.decodeIfPresent(String.self, forKey: .coverUrl)
        installed = (try? c.decodeIfPresent(Bool.self, forKey: .installed)) ?? false
        installCount = (try? c.decodeIfPresent(Int.self, forKey: .installCount)) ?? 0
        origin = (try? c.decodeIfPresent(PackOrigin.self, forKey: .origin)) ?? .unknown
        version = (try? c.decodeIfPresent(Int.self, forKey: .version)) ?? 0
        removable = (try? c.decodeIfPresent(Bool.self, forKey: .removable)) ?? true
        names = FramePack.lossyMap(c, .names, PackLocalizedName.self)
        preview = try? c.decodeIfPresent(PackAssetRef.self, forKey: .preview)
        usage = try? c.decodeIfPresent(FrameUsage.self, forKey: .usage)
        contractSchema = try? c.decodeIfPresent(Int.self, forKey: .contractSchema)
        contract = try? c.decodeIfPresent(PackAssetRef.self, forKey: .contract)
        strings = FramePack.lossyMap(c, .strings, PackAssetRef.self)
        collections = (try? c.decodeIfPresent(LossyDecodableArray<FramePackCollection>.self, forKey: .collections))?.elements ?? []
    }

    private static func lossyMap<Value: Decodable>(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys,
                                                   _ type: Value.Type) -> [String: Value] {
        guard let nested = try? c.nestedContainer(keyedBy: DynamicKey.self, forKey: key) else { return [:] }
        return nested.allKeys.reduce(into: [String: Value]()) { map, entry in
            if let value = try? nested.decode(Value.self, forKey: entry) { map[entry.stringValue] = value }
        }
    }

    /// Le nom dans la langue du lecteur, sinon celui que sert la passerelle.
    public func localizedName(language: String) -> String {
        names[Self.packLanguage(language)]?.name ?? name
    }

    public func localizedDescription(language: String) -> String {
        names[Self.packLanguage(language)]?.description ?? description
    }

    /// Les chaînes des cadres : la langue du lecteur, sinon le français.
    public func stringsRef(language: String) -> PackAssetRef? {
        strings[Self.packLanguage(language)] ?? strings["fr"]
    }

    /// `pt-BR` ⇒ `pt` : les packs nomment leurs langues par leur code court.
    static func packLanguage(_ language: String) -> String {
        String(language.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first ?? "fr")
    }
}

struct DynamicKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

// MARK: - Le contrat d'un pack de cadres (`glory-frame-pack.ts`)

/// Un cadre du contrat : son usage (jamais libre), sa vignette adressée par
/// contenu et les CLÉS de son nom, que les chaînes de la langue traduisent.
public struct GloryFramePackFrame: Hashable, Sendable, Identifiable {
    public let id: String
    public let usage: FrameUsage
    public let thumb: PackAssetRef
    public let nameKey: String
    public let storyKey: String?
    /// Où le cadre se range dans la loi (L3, #10154) ; `nil` pour un cadre de boutique sans placement (le pack
    /// d'exemple) ou dont le placement contredit l'usage — il ne se propose alors à aucune étape.
    public let placement: GloryFramePlacement?

    public init(id: String, usage: FrameUsage, thumb: PackAssetRef, nameKey: String, storyKey: String? = nil,
                placement: GloryFramePlacement? = nil) {
        self.id = id
        self.usage = usage
        self.thumb = thumb
        self.nameKey = nameKey
        self.storyKey = storyKey
        self.placement = placement
    }
}

public struct GloryFramePackContract: Hashable, Sendable {
    public static let schema = 1
    public static let maxFrameIDLength = 64
    public static let maxStringKeyLength = 120
    public static let maxStringLength = 2_000

    public let frames: [GloryFramePackFrame]

    /// **Lit un contrat** — `parseGloryFramePackContract`. `nil` pour une
    /// version inconnue ou une forme illisible : « Mettre à jour Meeshy », et
    /// rien ne se télécharge. Sinon les cadres lisibles, dans l'ordre, et le
    /// compte de ceux qui sont tombés (usage absent ou libre, vignette non
    /// adressée par contenu, clé de nom absente, identifiant repris).
    public static func parse(_ data: Data) -> (contract: GloryFramePackContract, rejected: Int)? {
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
              envelope.schema == schema else { return nil }
        let frames = envelope.frames.reduce(into: [GloryFramePackFrame]()) { kept, candidate in
            guard let frame = candidate.frame, !kept.contains(where: { $0.id == frame.id }) else { return }
            kept.append(frame)
        }
        return (GloryFramePackContract(frames: frames), envelope.frames.count - frames.count)
    }

    public init(frames: [GloryFramePackFrame]) {
        self.frames = frames
    }

    private struct Envelope: Decodable {
        let schema: Int
        let frames: [Candidate]
    }

    /// Un cadre candidat ne fait JAMAIS tomber l'enveloppe : il se lit, ou il
    /// se lit `nil` et se compte.
    private struct Candidate: Decodable {
        let frame: GloryFramePackFrame?

        private struct Names: Decodable {
            let name: String
            let story: String?
        }

        private struct Raw: Decodable {
            let id: String
            let usage: FrameUsage
            let thumb: PackAssetRef
            let i18n: Names
        }

        init(from decoder: Decoder) throws {
            guard let raw = try? Raw(from: decoder),
                  GloryFramePackContract.isFrameID(raw.id),
                  raw.usage.isGloryUsage,
                  PackStringKey.isValid(raw.i18n.name),
                  raw.i18n.story.map(PackStringKey.isValid) ?? true else {
                frame = nil
                return
            }
            let placement = GloryFramePlacement.read(id: raw.id, usage: raw.usage,
                                                     raw: try? GloryFramePlacement.Raw(from: decoder))
            frame = GloryFramePackFrame(id: raw.id, usage: raw.usage, thumb: raw.thumb,
                                        nameKey: raw.i18n.name, storyKey: raw.i18n.story, placement: placement)
        }
    }

    /// `GLORY_FRAME_ID_PATTERN` : des segments en forme de slug séparés par des points.
    static func isFrameID(_ id: String) -> Bool {
        guard id.count <= maxFrameIDLength else { return false }
        return id.split(separator: ".", omittingEmptySubsequences: false)
            .allSatisfy { StickerPackTemplateID.isSlugShaped(String($0)) }
    }
}

extension FrameUsage {
    /// Un cadre de gloire récompense le jeu : il n'est jamais libre.
    public var isGloryUsage: Bool {
        if case .free = self { return false }
        return true
    }
}

// MARK: - Les chaînes d'un pack dans une langue

/// `PACK_STRING_KEY_PATTERN` et `parsePackStrings` du shared.
public enum PackStringKey {
    public static func isValid(_ key: String) -> Bool {
        guard let first = key.first, key.count <= GloryFramePackContract.maxStringKeyLength,
              first.isASCII, first.isLowercase || first.isNumber else { return false }
        return key.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-") }
    }

    /// Une paire illisible tombe seule ; une forme illisible rend une table vide.
    public static func parseStrings(_ data: Data) -> [String: String] {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return object.reduce(into: [String: String]()) { table, entry in
            guard isValid(entry.key), let text = entry.value as? String,
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  text.count <= GloryFramePackContract.maxStringLength else { return }
            table[entry.key] = text
        }
    }
}
