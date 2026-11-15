import Foundation

/// **Un lien tel que l'auteur l'a ÉCRIT** (#9093) — la forme décide du rendu.
///
/// | écrit                   | affiché      | cible                                       |
/// |-------------------------|--------------|---------------------------------------------|
/// | `[[https://x]]`         | `https://x`  | `https://x` direct, sans suivi, pour tous   |
/// | `[libellé](https://x)`  | `libellé`    | `/l/<token>` si la carte l'a, sinon direct  |
/// | `https://x` brut        | `m+<token>`  | `/l/<token>` si la carte l'a, sinon direct  |
/// | `m+<token>` historique  | `m+<token>`  | `/l/<token>`                                |
///
/// `verbatim` porte aussi ce qui s'affiche tel quel sans jamais être suivi
/// (une adresse e-mail). Jumelle web : `resolveLinkDisplay`
/// (`apps/web/src/lib/links/link-display.ts`).
public enum WrittenLink: Equatable, Sendable {
    case verbatim(text: String, url: URL)
    case labelled(label: String, url: URL)
    case bare(text: String, url: URL)
    case shortCode(token: String)
}

/// Ce que le lecteur lit (`text`), où le toucher mène (`url`), et la prose
/// écrite collée à l'adresse brute qui n'en fait pas partie (`remainder` :
/// le point final d'une phrase, rendu au texte quand l'adresse devient `m+<token>`).
public struct LinkDisplay: Equatable, Sendable {
    public let text: String
    public let url: URL
    public let isTracked: Bool
    public let remainder: String

    public init(text: String, url: URL, isTracked: Bool, remainder: String = "") {
        self.text = text
        self.url = url
        self.isTracked = isTracked
        self.remainder = remainder
    }
}

/// **La loi de rendu d'un lien** (#9093) — pure : le contenu n'est jamais
/// réécrit, tout se décide ici depuis la carte `[url: token]` servie à côté du
/// texte et l'origine web de l'environnement actif (`TrackedLink.redirectURL`).
/// `nil` ⇒ aucun lien ne peut se poser (origine web illisible) : le texte reste du texte.
public enum LinkDisplayLaw {

    public static func resolve(_ link: WrittenLink,
                               trackedLinks: [String: String]?,
                               webOrigin: String = MeeshyConfig.shared.webOrigin) -> LinkDisplay? {
        switch link {
        case .verbatim(let text, let url):
            return LinkDisplay(text: text, url: url, isTracked: false)

        case .shortCode(let token):
            return TrackedLink.redirectURL(token: token, webOrigin: webOrigin)
                .map { LinkDisplay(text: "m+\(token)", url: $0, isTracked: true) }

        case .labelled(let label, let url):
            guard let target = trackedTarget(for: url.absoluteString, in: trackedLinks, webOrigin: webOrigin) else {
                return LinkDisplay(text: label, url: url, isTracked: false)
            }
            return LinkDisplay(text: label, url: target.url, isTracked: true)

        case .bare(let text, let url):
            for key in candidateKeys(text) {
                if let target = trackedTarget(for: key, in: trackedLinks, webOrigin: webOrigin) {
                    return LinkDisplay(text: "m+\(target.token)", url: target.url, isTracked: true,
                                       remainder: String(text.dropFirst(key.count)))
                }
            }
            return LinkDisplay(text: text, url: url, isTracked: false)
        }
    }

    /// Un jeton n'entre dans une adresse qu'après la forme que la passerelle
    /// émet — jumelle de `isTrackingToken` (`packages/shared/utils/text-segments.ts`).
    public static func isTrackingToken(_ token: String) -> Bool {
        token.range(of: #"^[A-Za-z0-9_-]{1,49}[A-Za-z0-9]$"#, options: .regularExpression) != nil
    }

    private static func trackedTarget(for key: String, in map: [String: String]?,
                                      webOrigin: String) -> (token: String, url: URL)? {
        guard let token = map?[key], isTrackingToken(token),
              let url = TrackedLink.redirectURL(token: token, webOrigin: webOrigin) else { return nil }
        return (token, url)
    }

    /// L'adresse telle qu'écrite, puis rognée de sa ponctuation finale un
    /// caractère à la fois — la passerelle a frappé le jeton sur l'adresse nue.
    private static let trailingPunctuation: Set<Character> = [".", ",", ";", ":", "!", "?", ")", "]"]

    private static func candidateKeys(_ text: String) -> [String] {
        var keys = [text]
        var current = text
        while let last = current.last, trailingPunctuation.contains(last) {
            current.removeLast()
            keys.append(current)
        }
        return keys
    }
}
