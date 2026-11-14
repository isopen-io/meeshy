import Foundation

/// Les deux liens de la ligne de consentement de l'inscription (#17671,
/// règle 2) : le consentement légal tient en UNE phrase dont les deux groupes
/// de mots sont les liens, au lieu d'une phrase suivie d'une rangée de deux
/// boutons qui la répétaient.
enum SignupLegalLink: String, CaseIterable {
    case terms
    case privacy

    static let scheme = "meeshy-legal"

    var url: URL {
        URL(string: "\(Self.scheme)://\(rawValue)") ?? URL(fileURLWithPath: "/")
    }

    init?(url: URL) {
        guard url.scheme == Self.scheme, let host = url.host, let link = SignupLegalLink(rawValue: host) else { return nil }
        self = link
    }
}

enum SignupLegalNotice {
    /// `format` porte deux emplacements POSITIONNELS (`%1$@` les conditions,
    /// `%2$@` la politique) : l'ordre des mots varie d'une langue à l'autre, le
    /// lien suit le groupe de mots où qu'il tombe.
    static func attributed(format: String, terms: String, privacy: String) -> AttributedString {
        var text = AttributedString(String(format: format, terms, privacy))
        for (label, link) in [(terms, SignupLegalLink.terms), (privacy, SignupLegalLink.privacy)] {
            guard let range = text.range(of: label) else { continue }
            text[range].link = link.url
        }
        return text
    }
}
