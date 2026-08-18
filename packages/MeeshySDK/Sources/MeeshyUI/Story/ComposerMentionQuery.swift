import Foundation

/// Règles PURES de la mention « @ » dans un composeur.
///
/// Elles vivent seules — ni SwiftUI, ni réseau — parce que ce sont les seules
/// parties DÉCIDABLES de la mention : où commence le handle qu'on est en train
/// de taper, par quoi le remplacer, et quels handles un texte porte au bout du
/// compte. Le panneau de suggestions et l'appel réseau, eux, sont de la
/// présentation, et se testent mal.
///
/// La récolte (`handles(in:)`) n'est pas un luxe : côté serveur, le SEUL canal
/// de mention d'un post est son `content` — `POST /posts` n'accepte aucune
/// liste de mentionnés, et le gateway extrait les `@handle` du texte pour
/// persister `Mention` et notifier. Une story dont les mentions ne vivent que
/// sur le canevas ne notifierait donc personne.
///
/// `nonisolated` : `MeeshyUI` compile sous `defaultIsolation(MainActor)`, et une
/// règle de chaîne de caractères n'a rien à faire sur l'acteur principal — ses
/// tests non plus.
public nonisolated enum ComposerMentionQuery {

    /// Caractères qu'un pseudo Meeshy peut porter. Le point et le tiret y sont
    /// parce que des pseudos en contiennent ; l'espace, jamais — c'est lui qui
    /// clôt le handle en cours de frappe.
    private static let handleCharacters = CharacterSet.alphanumerics
        .union(CharacterSet(charactersIn: "_.-"))

    private static func isHandleCharacter(_ character: Character) -> Bool {
        character.unicodeScalars.allSatisfy { handleCharacters.contains($0) }
    }

    /// Un `@` n'ouvre un handle qu'en DÉBUT de texte ou après une séparation.
    /// Sans cette règle, `contact@exemple.com` ouvrirait une recherche sur
    /// « exemple.com » à chaque adresse e-mail tapée.
    private static func opensHandle(at index: String.Index, in text: String) -> Bool {
        guard index > text.startIndex else { return true }
        let previous = text[text.index(before: index)]
        return previous.isWhitespace || previous.isNewline
    }

    /// Le fragment `@…` en cours de frappe À LA FIN du texte, sans son `@`.
    ///
    /// Chaîne VIDE = le `@` vient d'être tapé : c'est un cas nominal, pas une
    /// absence — la liste par défaut (contacts) s'affiche alors.
    /// `nil` = aucun handle en cours (pas de `@`, ou un espace l'a clos).
    public static func trailingHandle(in text: String) -> String? {
        guard let at = text.lastIndex(of: "@"), opensHandle(at: at, in: text) else { return nil }
        let fragment = text[text.index(after: at)...]
        guard fragment.allSatisfy(isHandleCharacter) else { return nil }
        // Plus long que ça, ce n'est plus une frappe : c'est un collage.
        guard fragment.count <= 32 else { return nil }
        return String(fragment)
    }

    /// Remplace le handle en cours de frappe par `@username `, espace compris —
    /// le suivant s'écrit à la suite sans rouvrir la liste.
    /// Texte rendu inchangé s'il n'y a pas de handle en cours.
    public static func replacingTrailingHandle(in text: String, with username: String) -> String {
        guard trailingHandle(in: text) != nil, let at = text.lastIndex(of: "@") else { return text }
        return String(text[text.startIndex..<at]) + "@" + username + " "
    }

    /// Les handles portés par un texte, sans leur `@`, dans l'ordre d'apparition
    /// et dédupliqués sans tenir compte de la casse (le serveur résout les
    /// pseudos de la même façon).
    public static func handles(in text: String) -> [String] {
        var found: [String] = []
        var seen = Set<String>()
        var index = text.startIndex
        while index < text.endIndex {
            guard text[index] == "@", opensHandle(at: index, in: text) else {
                index = text.index(after: index)
                continue
            }
            let start = text.index(after: index)
            var end = start
            while end < text.endIndex, isHandleCharacter(text[end]) {
                end = text.index(after: end)
            }
            let handle = String(text[start..<end])
            if !handle.isEmpty, seen.insert(handle.lowercased()).inserted {
                found.append(handle)
            }
            index = max(end, start)
        }
        return found
    }

    /// Les pseudos que le CANEVAS nomme, dans l'ordre où l'auteur les a posés et
    /// dédupliqués sans tenir compte de la casse.
    ///
    /// C'est ce que la publication déclare au serveur (`mentions` de
    /// `POST /posts`). Avant ce canal, le gateway n'extrayait les mentions que
    /// du `content` : nommer quelqu'un par une pastille imposait d'écrire son
    /// `@handle` dans la légende — une phrase inventée pour satisfaire
    /// l'extracteur, visible de tous, et traduite par le Prisme comme du contenu
    /// d'auteur. La déclaration remplace cette contorsion.
    public static func handles(inAll texts: [String]) -> [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for handle in texts.flatMap(handles(in:)) where seen.insert(handle.lowercased()).inserted {
            ordered.append(handle)
        }
        return ordered
    }
}
