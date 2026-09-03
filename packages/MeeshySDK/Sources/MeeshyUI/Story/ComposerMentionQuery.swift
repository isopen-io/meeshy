import Foundation
import MeeshySDK

/// Règles PURES de la mention « @ » dans un composeur.
///
/// Elles vivent seules — ni SwiftUI, ni réseau — parce que ce sont les seules
/// parties DÉCIDABLES de la mention : où commence le handle qu'on est en train
/// de taper, par quoi le remplacer, et quels handles un texte porte au bout du
/// compte. Le panneau de suggestions et l'appel réseau, eux, sont de la
/// présentation, et se testent mal.
///
/// La RÉCOLTE des `@handle` n'y est plus : le serveur relit le texte lui-même
/// (la légende ET les objets du canevas, badges exclus), et ce que le texte ne
/// peut pas porter, le client le DÉCLARE — cf. `ComposerReferences.payload`.
/// Deux dériveurs finiraient par ne plus dire la même chose.
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
}

/// Une personne que l'auteur a choisi de nommer, et COMMENT.
///
/// `userId` quand un sélecteur l'a rendu, `username` toujours : c'est lui qui
/// survit à un brouillon repris trois jours plus tard, là où un id devrait être
/// persisté en parallèle des effets.
public nonisolated struct ComposerReference: Sendable, Equatable {
    public let username: String
    public let userId: String?
    public var display: PostReferenceDisplay

    /// **À quelle PUBLICATION cette mention appartient** (#4068, porteur
    /// 2026-09-03).
    ///
    /// > Une mention est attachée à la publication. En Story, une publication
    /// > est une slide ; en Post et en Réel, il n'y en a qu'une.
    ///
    /// D'où un `String?` et non un booléen ou un mode : en profil Story, la
    /// clé est l'id de la SLIDE, parce que publier N slides crée N
    /// publications. Sans ce champ, `references` vivait au COMPOSER et la
    /// boucle d'envoi semait la même liste sur chacune — une NOTE posée en
    /// pensant à la slide 1 notifiait trois fois et apparaissait sous trois
    /// stories.
    ///
    /// `nil` signifie « toutes les publications de ce composer ». C'est le cas
    /// NOMINAL en Post et en Réel (il n'y en a qu'une), et le repli des
    /// brouillons repris d'avant ce lot, dont rien ne permet de deviner la
    /// slide visée.
    public var publicationKey: String?

    public init(username: String, userId: String? = nil,
                display: PostReferenceDisplay, publicationKey: String? = nil) {
        self.username = username
        self.userId = userId
        self.display = display
        self.publicationKey = publicationKey
    }
}

/// Les règles PURES de l'état « qui ce contenu nomme, et comment ».
///
/// Ni SwiftUI, ni réseau — c'est ce qui les rend testables en millisecondes, et
/// c'est ce qui les fera SURVIVRE à la convergence des composers Reel / Post /
/// Story : l'interface changera, la règle non.
public nonisolated enum ComposerReferences {

    /// Ajoute une personne, ou change son mode si elle est déjà là.
    ///
    /// EN PLACE, pas en fin de liste : choisir un mode et en changer sont le
    /// même geste côté UI, et voir la pastille sauter au bout de la rangée à
    /// chaque changement donnerait l'impression d'avoir ajouté quelqu'un.
    /// **L'identité d'une référence est (pseudo, publication)** — pas le pseudo
    /// seul (#4068).
    ///
    /// Nommer la même personne sur deux slides d'une Story est un geste
    /// légitime : ce sont deux publications distinctes. Avec le pseudo pour
    /// seule clé, la seconde pose ÉCRASAIT la première au lieu de s'y ajouter,
    /// et l'auteur voyait sa mention disparaître de la slide précédente sans
    /// rien avoir retiré.
    ///
    /// > Ajouter un axe de portée à une donnée déplace sa clé d'unicité. Ne pas
    /// > suivre ce déplacement produit un écrasement SILENCIEUX, exactement là
    /// > où la nouvelle portée devait apporter de la précision.
    public static func upsert(
        _ reference: ComposerReference,
        into references: [ComposerReference]
    ) -> [ComposerReference] {
        let key = reference.username.lowercased()
        guard let index = references.firstIndex(where: {
            $0.username.lowercased() == key && $0.publicationKey == reference.publicationKey
        }) else {
            return references + [reference]
        }
        var updated = references
        updated[index].display = reference.display
        return updated
    }

    /// Retire une personne. Insensible à la casse — le serveur résout les
    /// pseudos de la même façon.
    /// Retire une personne. Insensible à la casse — le serveur résout les
    /// pseudos de la même façon.
    ///
    /// `publicationKey: nil` retire la personne de TOUTES les publications ;
    /// une clé ne retire que de celle-là. Le défaut est le retrait total, qui
    /// est le geste attendu depuis une feuille qui liste les personnes nommées
    /// sans dire sur quelle slide.
    public static func remove(
        username: String,
        from references: [ComposerReference],
        publicationKey: String? = nil
    ) -> [ComposerReference] {
        let key = username.lowercased()
        return references.filter { reference in
            guard reference.username.lowercased() == key else { return true }
            guard let publicationKey else { return false }
            return reference.publicationKey != publicationKey
        }
    }

    /// Ce que la publication DÉCLARE au serveur : les non-INLINE, et elles
    /// seules.
    ///
    /// INLINE est absent par construction — le serveur le dérive en relisant
    /// les `@handle` du texte, et le déclarer ouvrirait un second chemin vers le
    /// même fait, que le premier désaccord ferait diverger.
    /// **Ce qu'UNE publication emporte** (#4068).
    ///
    /// - `publicationKey: nil` ⇒ la publication est unique (Post, Réel) : tout
    ///   part, puisque toute mention lui appartient ;
    /// - une clé ⇒ une slide de Story : seules SES mentions partent, plus
    ///   celles qui n'ont pas de clé (brouillons d'avant le lot).
    ///
    /// > Perdre est pire que répéter, ici. Une référence sans clé est servie
    /// > partout plutôt que nulle part : l'auteur l'a bel et bien posée, et une
    /// > donnée qu'on n'a jamais écrite ne se devine pas.
    public static func payload(
        _ references: [ComposerReference],
        for publicationKey: String?
    ) -> [PostMentionInput] {
        let retenues = references.filter { reference in
            guard let publicationKey else { return true }
            guard let clé = reference.publicationKey else { return true }
            return clé == publicationKey
        }
        return payload(retenues)
    }

    public static func payload(_ references: [ComposerReference]) -> [PostMentionInput] {
        references.compactMap { reference in
            guard reference.display != .inline else { return nil }
            guard let userId = reference.userId else {
                return .handle(reference.username, display: reference.display)
            }
            return .id(userId, display: reference.display)
        }
    }

    /// Retire un `@handle` du texte, avec l'espace qu'il laisserait derrière lui.
    ///
    /// C'est la transition INLINE → autre chose : passer une référence en badge,
    /// en note ou en silence n'a de sens que si le pseudo quitte la phrase.
    /// Frontière de mot à droite : `@alice` ne doit pas emporter `@alicia`.
    ///
    /// Frontière de mot à GAUCHE `(?<![\p{L}\p{N}_-])` — jumelle du `NAME_BOUNDARY_LEFT`
    /// TS (`packages/shared/utils/mention-parser.ts`) : un `@` précédé d'un caractère
    /// de nom appartient à une adresse e-mail (`bob@alice`), n'a jamais été détecté
    /// comme mention, et ne doit donc pas être retiré ici. Sans ce lookbehind, la
    /// suppression frappait un span que la détection n'avait jamais reconnu.
    public static func removingHandle(_ username: String, from text: String) -> String {
        let escaped = NSRegularExpression.escapedPattern(for: username)
        guard let regex = try? NSRegularExpression(
            pattern: "\\s*(?<![\\p{L}\\p{N}_-])@\(escaped)(?![\\p{L}\\p{N}_.-])",
            options: [.caseInsensitive]
        ) else { return text }

        let range = NSRange(text.startIndex..., in: text)
        let stripped = regex.stringByReplacingMatches(in: text, range: range, withTemplate: "")
        return stripped.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// D'où vient le geste — et donc quel mode un simple tap pose.
///
/// Deux entrées, deux défauts, parce que les deux gestes ne veulent pas dire la
/// même chose : depuis le chip, on nomme quelqu'un SANS l'écrire (le plus
/// discret gagne) ; depuis la liste `@`, on est en train de l'écrire (l'inline
/// gagne). L'appui long ouvre le même choix dans les deux cas.
public nonisolated enum ReferencePickerContext: Sendable {
    case picker
    case textList

    var tapDefault: PostReferenceDisplay {
        switch self {
        case .picker: return .silent
        case .textList: return .inline
        }
    }
}

/// Le geste posé sur une personne : le tap, qui ne dit rien du mode, ou le
/// choix explicite sorti de l'appui long.
public nonisolated enum ReferenceGesture: Sendable {
    case tap
    case choose(PostReferenceDisplay)
}

/// La transition d'état d'un geste de sélection — pure, donc testable sans UI.
public nonisolated enum ReferencePickerLogic {
    public static func apply(
        _ gesture: ReferenceGesture,
        username: String,
        userId: String?,
        to references: [ComposerReference],
        context: ReferencePickerContext
    ) -> [ComposerReference] {
        let display: PostReferenceDisplay
        switch gesture {
        case .tap: display = context.tapDefault
        case .choose(let chosen): display = chosen
        }
        return ComposerReferences.upsert(
            ComposerReference(username: username, userId: userId, display: display),
            into: references
        )
    }
}
