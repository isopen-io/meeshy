import Foundation

/// **UN LIEN À JETON D'E-MAIL N'ENTRE QUE PAR L'E-MAIL QUI LE PORTE** — le
/// miroir Swift UNIQUE de `packages/shared/utils/email-link-secret.ts`
/// (#10870, #10871, #10874, #10875).
///
/// Deux questions, deux lectures, et aucune ne remplace l'autre :
/// - `carriesSecret` — LARGE : le chemin, une fois normalisé comme le lit la
///   règle partagée (casse, barres doublées, `\`, encodages multiples,
///   invisibles, `;`, espaces, `.` et `..`), est-il celui d'un lien à jeton, ou
///   SOUS lui ? Un tel lien touché dans l'app part au navigateur.
/// - `exactForm` — ÉTROITE : la seule forme qu'écrivent les e-mails, octet
///   pour octet, en https, sans identifiants ni port. Rien d'autre ne connecte,
///   ne vérifie ni ne réinitialise : une variante part à Safari (fail-closed).
nonisolated enum EmailLinkSecret {

    /// La forme exacte d'un lien d'e-mail que l'app sait ouvrir.
    enum Form: Equatable {
        /// `pathToken` : le jeton historique écrit dans le chemin
        /// (`/auth/magic-link/<jeton>`) ; `nil` ⇒ il voyage dans le fragment
        /// ou la requête.
        case magicLink(pathToken: String?)
        case verifyEmail
        case resetPassword
    }

    /// Ces chemins sont ceux de PAGES web (meeshy.me), pas d'API : ils s'écrivent
    /// en segments, comme dans `DeepLinkRouter`, pour que l'audit des chemins
    /// d'API écrits à la main (#4588) ne les prenne pas pour des 404.
    private static func page(_ segments: String...) -> String {
        "/" + segments.joined(separator: "/")
    }

    static let aliases: [String: String] = [
        page("auth", "email-link", "magic-link"): page("auth", "magic-link"),
        page("auth", "email-link", "verify-email"): page("auth", "verify-email"),
        page("auth", "email-link", "reset-password"): page("reset-password"),
    ]

    static let paths: Set<String> = [
        page("auth", "verify-email"),
        page("auth", "magic-link"),
        page("auth", "magic-link", "validate"),
        page("auth", "revoke-sessions"),
        page("reset-password"),
        page("account", "deletion"),
        page("settings", "verify-email-change"),
    ]

    private static let secretPrefixes: [String] = Array(paths) + [page("auth", "email-link"), page("auth", "reset-password")]

    private static let exactForms: [String: Form] = [
        page("auth", "magic-link"): .magicLink(pathToken: nil),
        page("auth", "email-link", "magic-link"): .magicLink(pathToken: nil),
        page("auth", "verify-email"): .verifyEmail,
        page("auth", "email-link", "verify-email"): .verifyEmail,
        page("reset-password"): .resetPassword,
        page("auth", "reset-password"): .resetPassword,
        page("auth", "email-link", "reset-password"): .resetPassword,
    ]

    private static let pathTokenPrefix = page("auth", "magic-link") + "/"
    private static let pathTokenCharacters = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")

    // MARK: - Lecture large

    /// L'adresse porte-t-elle un chemin de lien à jeton ? Sous `meeshy://`, le
    /// premier segment est l'hôte (`meeshy://auth/magic-link`).
    static func carriesSecret(_ url: URL) -> Bool {
        rawPaths(of: url).contains(where: carriesSecret(path:))
    }

    /// Le chemin, une fois normalisé, est-il celui d'un lien à jeton, ou SOUS lui ?
    static func carriesSecret(path: String) -> Bool {
        let normalized = normalize(path)
        let canonical = aliases[normalized] ?? normalized
        return secretPrefixes.contains { canonical == $0 || canonical.hasPrefix($0 + "/") }
    }

    // MARK: - Lecture étroite

    /// La forme exacte, ou `nil`. Le chemin se compare BRUT (encodé) : un
    /// `%20`, un `;`, une barre doublée, une majuscule ou un segment de plus
    /// n'y ressemblent à rien.
    static func exactForm(_ url: URL) -> Form? {
        guard url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil,
              url.port == nil || url.port == 443,
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath else { return nil }
        if let form = exactForms[path] { return form }
        guard path.hasPrefix(pathTokenPrefix) else { return nil }
        let token = String(path.dropFirst(pathTokenPrefix.count))
        guard !token.isEmpty, token != "validate",
              token.unicodeScalars.allSatisfy(pathTokenCharacters.contains) else { return nil }
        return .magicLink(pathToken: token)
    }

    // MARK: - Normalisation (celle de la règle partagée)

    private static let maxDecodeRounds = 4

    private static func rawPaths(of url: URL) -> [String] {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let path = components?.percentEncodedPath ?? url.path
        guard url.scheme?.lowercased() == "meeshy" else { return [path] }
        let host = components?.percentEncodedHost ?? url.host ?? ""
        return ["/" + host + path, path]
    }

    private static func normalize(_ path: String) -> String {
        let decoded = decode(path).lowercased().replacingOccurrences(of: "\\", with: "/")
        let kept = decoded.split(separator: "/", omittingEmptySubsequences: false)
            .map { normalizeSegment(String($0)) }
            .filter { !$0.isEmpty && $0 != "." }
            .reduce(into: [String]()) { kept, segment in
                if segment == ".." { _ = kept.popLast() } else { kept.append(segment) }
            }
        return "/" + kept.joined(separator: "/")
    }

    private static func decode(_ path: String, round: Int = 0) -> String {
        let decoded = decodeRound(path)
        return decoded == path || round >= maxDecodeRounds ? decoded : decode(decoded, round: round + 1)
    }

    /// Décode chaque suite de `%xx` ; une suite invalide reste telle quelle,
    /// comme `decodeURIComponent` sous `try` côté TS.
    private static func decodeRound(_ path: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: "(?:%[0-9a-fA-F]{2})+") else { return path }
        let source = path as NSString
        let matches = regex.matches(in: path, range: NSRange(location: 0, length: source.length))
        var result = ""
        var cursor = 0
        for match in matches {
            result += source.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            let run = source.substring(with: match.range)
            result += run.removingPercentEncoding ?? run
            cursor = match.range.location + match.range.length
        }
        result += source.substring(from: cursor)
        return result
    }

    private static func normalizeSegment(_ segment: String) -> String {
        let visible = String(String.UnicodeScalarView(segment.unicodeScalars.filter { !isDefaultIgnorable($0) }))
        let head = visible.split(omittingEmptySubsequences: false, whereSeparator: { ";?#".contains($0) }).first.map(String.init) ?? ""
        return head.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{0085}")))
    }

    private static func isDefaultIgnorable(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x00AD, 0x034F, 0x061C, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x3164, 0xFEFF, 0xFFA0: return true
        case 0x180B...0x180F, 0x200B...0x200F, 0x202A...0x202E, 0x2060...0x206F, 0xFE00...0xFE0F: return true
        default: return false
        }
    }
}
