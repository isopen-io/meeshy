import Foundation

/// Le lien d'une FICHE Meeshy collé dans un message (#18865, iOS #19519) : `https://meeshy.me/u/<pseudo>` ou
/// l'adresse courte `https://meeshy.me/@<pseudo>`, en production comme en staging.
///
/// Miroir de `personHandleFromLink` (`packages/shared/utils/person-link.ts`), tenu par les MÊMES vecteurs
/// (`packages/shared/__tests__/person-link.test.ts`). Un client qui reconnaît ce lien ne va pas lire l'Open Graph
/// de la page publique (qui ne nomme personne, #10205) : il demande la carte du LECTEUR à la passerelle.
///
/// Fail-closed : un autre hôte, un autre schéma, un identifiant ou un port, un second segment ou un pseudo hors du
/// motif de l'inscription (`^[a-zA-Z0-9_-]+$`, 64 au plus) ne lisent rien.
public enum PersonLink {

    public static let hosts: Set<String> = ["meeshy.me", "www.meeshy.me", "staging.meeshy.me"]

    static let handleMaxLength = 64

    public static func handle(from link: String) -> String? {
        guard let components = URLComponents(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              components.scheme?.lowercased() == "https",
              components.user == nil, components.password == nil, components.port == nil,
              let host = components.host?.lowercased(), hosts.contains(host)
        else { return nil }
        return handle(inPath: components.percentEncodedPath)
    }

    private static func handle(inPath path: String) -> String? {
        guard path.hasPrefix("/") else { return nil }
        var rest = String(path.dropFirst())
        if rest.hasSuffix("/") { rest = String(rest.dropLast()) }
        let candidate: Substring
        if rest.hasPrefix("u/") {
            candidate = rest.dropFirst(2)
        } else if rest.hasPrefix("@") {
            candidate = rest.dropFirst()
        } else {
            return nil
        }
        guard !candidate.isEmpty, candidate.count <= handleMaxLength, candidate.allSatisfy(isHandleCharacter) else {
            return nil
        }
        return String(candidate)
    }

    private static func isHandleCharacter(_ character: Character) -> Bool {
        guard character.isASCII else { return false }
        return character.isLetter || character.isNumber || character == "_" || character == "-"
    }
}
