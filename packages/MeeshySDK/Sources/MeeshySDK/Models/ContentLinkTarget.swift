import Foundation

/// **Le lien d'un contenu Meeshy** (#19331, #19332) — un post, un réel, une
/// story ou une humeur. Miroir Swift de `contentLinkTarget`
/// (`packages/shared/utils/content-link.ts`), qui rejoue ses vecteurs
/// (`packages/shared/fixtures/content-link/content-link.vectors.json`) : un hôte,
/// un chemin ou une forme d'identifiant ajouté d'un côté rougit de l'autre.
///
/// Deux formes :
/// - l'adresse DIRECTE (`/post|reel|story|mood/<id>`, et les anciennes
///   `/feeds/post/<id>`, `/p/<id>`, `/s/<id>`) : l'identifiant se lit dans
///   l'adresse ;
/// - le lien SUIVI `/l/<jeton>` : seule la passerelle sait ce qu'il désigne
///   (`ContentLinkTarget.trackedContent(of:)` lit sa résolution).
///
/// Fail-closed : un autre hôte, un autre schéma que `https`, des identifiants
/// ou un port dans l'adresse, un segment de plus, ou un identifiant qui n'est
/// pas un ObjectId ne lisent rien. Le type d'un contenu est `PostType`, le
/// miroir de `ContentKind`.
public enum ContentLinkTarget: Hashable, Sendable {
    case content(ContentPathTarget)
    case tracked(token: String)

    /// Les hôtes de l'application web, en production comme en staging.
    public static let webHosts: Set<String> = ["meeshy.me", "www.meeshy.me", "staging.meeshy.me"]

    public static func parse(_ link: String) -> ContentLinkTarget? {
        guard let path = meeshyPercentEncodedPath(link) else { return nil }
        if let direct = pathTarget(path) { return .content(direct) }
        return trackedToken(path).map { .tracked(token: $0) }
    }

    /// Le contenu qu'un CHEMIN désigne, sans hôte (`contentPathTarget`).
    public static func pathTarget(_ path: String) -> ContentPathTarget? {
        guard let parts = segments(of: path) else { return nil }
        switch parts.count {
        case 2:
            guard let kind = PathKind(segment: parts[0]) else { return nil }
            return contentTarget(id: parts[1], type: kind.type)
        case 3 where parts[0] == "feeds" && parts[1] == "post":
            return contentTarget(id: parts[2], type: nil)
        default:
            return nil
        }
    }

    /// L'adresse canonique d'un contenu sous une origine (`contentWebUrl`).
    public static func webURL(origin: String, type: PostType, postId: String) -> String {
        var base = origin
        while base.hasSuffix("/") { base.removeLast() }
        return "\(base)/\(type.contentWebPath)/\(postId)"
    }

    /// **Ce qu'un lien suivi résolu désigne** (contrat § 1) : sa cible typée
    /// (`kind == "tracking"`, un des quatre types, un ObjectId) — ou, à défaut,
    /// son `originalUrl` quand c'est lui-même l'adresse DIRECTE d'un contenu
    /// (un lien frappé dans le texte d'un message, `targetType = EXTERNAL`).
    /// `nil` : une invitation, un profil, un site — pas une carte de contenu.
    public static func trackedContent(of resolved: ResolvedTrackedLink) -> ContentPathTarget? {
        guard resolved.kind == "tracking" else { return nil }
        if let type = resolved.targetType.flatMap(PostType.init(rawValue:)),
           let targetId = resolved.targetId, SharedTranslationFormat.isObjectId(targetId) {
            return ContentPathTarget(postId: targetId, type: type)
        }
        guard let original = resolved.originalUrl, case .content(let direct)? = parse(original) else { return nil }
        return direct
    }

    // MARK: - Lecture

    private static func meeshyPercentEncodedPath(_ link: String) -> String? {
        let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: trimmed),
              components.scheme?.lowercased() == "https",
              (components.user ?? "").isEmpty, (components.password ?? "").isEmpty,
              components.port == nil || components.port == defaultHTTPSPort,
              let host = components.host?.lowercased(), webHosts.contains(host)
        else { return nil }
        return components.percentEncodedPath
    }

    /// Le port 443 est le port par défaut de `https` : le `URL` du web le tait,
    /// donc la loi TypeScript l'accepte comme une adresse sans port.
    private static let defaultHTTPSPort = 443

    /// Les segments d'un chemin `/a/b[/]` : une seule barre finale tolérée,
    /// aucun segment vide.
    private static func segments(of path: String) -> [String]? {
        guard path.hasPrefix("/") else { return nil }
        var body = path.dropFirst()
        if body.hasSuffix("/") { body = body.dropLast() }
        let parts = body.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        return parts.contains(where: \.isEmpty) ? nil : parts
    }

    private static func contentTarget(id: String, type: PostType?) -> ContentPathTarget? {
        SharedTranslationFormat.isObjectId(id) ? ContentPathTarget(postId: id, type: type) : nil
    }

    /// `^[A-Za-z0-9_-]{2,50}$`, la forme que `GET /l/:token` accepte.
    private static func trackedToken(_ path: String) -> String? {
        guard let parts = segments(of: path), parts.count == 2, parts[0] == "l" else { return nil }
        let token = parts[1]
        let bytes = Array(token.utf8)
        guard (2...50).contains(bytes.count), bytes.allSatisfy(isTokenByte) else { return nil }
        return token
    }

    private static func isTokenByte(_ byte: UInt8) -> Bool {
        let isDigit = (0x30...0x39).contains(byte)
        let isLetter = (0x41...0x5A).contains(byte) || (0x61...0x7A).contains(byte)
        return isDigit || isLetter || byte == 0x5F || byte == 0x2D
    }

    /// Le type qu'annonce un segment ; une forme ancienne (`p`) n'en annonce
    /// aucun — il se lit sur le contenu.
    private enum PathKind {
        case typed(PostType)
        case legacy

        init?(segment: String) {
            if let type = PostType.allCases.first(where: { $0.contentWebPath == segment }) {
                self = .typed(type)
                return
            }
            switch segment {
            case "p": self = .legacy
            case "s": self = .typed(.story)
            default: return nil
            }
        }

        var type: PostType? {
            switch self {
            case .typed(let type): return type
            case .legacy: return nil
            }
        }
    }
}

/// L'identifiant d'un contenu et son type ANNONCÉ par l'adresse (`nil` : une
/// forme ancienne, dont le type se lit sur le contenu).
public struct ContentPathTarget: Hashable, Sendable {
    public let postId: String
    public let type: PostType?

    public init(postId: String, type: PostType?) {
        self.postId = postId
        self.type = type
    }
}

/// Le premier lien de CONTENU d'un texte : l'adresse telle qu'elle y est
/// écrite, et ce qu'elle désigne.
public struct ContentLinkMatch: Hashable, Sendable {
    public let url: String
    public let target: ContentLinkTarget

    public init(url: String, target: ContentLinkTarget) {
        self.url = url
        self.target = target
    }

    /// Le premier des `urls` (dans l'ordre du texte) qui désigne un contenu.
    /// `excludingPostId` écarte l'adresse directe du contenu qui porte ce texte :
    /// un post ne se cite pas lui-même.
    public static func first(among urls: [String], excludingPostId excluded: String? = nil) -> ContentLinkMatch? {
        let matches = urls.compactMap { url in ContentLinkTarget.parse(url).map { ContentLinkMatch(url: url, target: $0) } }
        return matches.first { !$0.designatesPost(excluded) }
    }

    private func designatesPost(_ postId: String?) -> Bool {
        guard let postId, case .content(let path) = target else { return false }
        return path.postId.lowercased() == postId.lowercased()
    }
}

extension PostType {
    /// Le chemin web de chaque type (`CONTENT_WEB_PATHS`) : celui que frappe le
    /// partage suivi, et que la loi relit.
    public var contentWebPath: String {
        switch self {
        case .post: return "post"
        case .reel: return "reel"
        case .story: return "story"
        case .status: return "mood"
        }
    }
}
