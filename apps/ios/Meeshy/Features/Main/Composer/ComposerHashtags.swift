import Foundation
import MeeshySDK

/// **Les hashtags d'une publication — DÉRIVÉS du texte, jamais déclarés à
/// côté** (#4636, directive porteur 2026-08-31).
///
/// ## Pourquoi une dérivation et pas une liste
///
/// Le dépôt a déjà tranché la même question pour les mentions, et la réponse
/// vaut mot pour mot ici :
///
/// > « INLINE est absent par construction — le serveur le dérive en relisant les
/// > `@handle` du texte, et le déclarer ouvrirait un second chemin vers le même
/// > fait, que le premier désaccord ferait diverger. »
/// > — `ComposerMentionQuery.payload`
///
/// Un `#voyage` écrit dans la phrase EST le hashtag. Tenir à côté une liste que
/// l'auteur pourrait modifier séparément produirait deux vérités : celle qu'on
/// lit dans le texte et celle qu'on envoie. L'outil hashtag n'ajoute donc pas à
/// une liste — **il écrit dans le texte**, et la section de la feuille d'audience
/// ne fait que MONTRER ce que le texte contient déjà.
///
/// ## Les frontières
///
/// Jumelles de celles des mentions (`ComposerMentionQuery.removingHandle`) : un
/// `#` précédé d'un caractère de nom appartient à autre chose (`a#b`, une ancre
/// d'URL `page#section`) et n'est pas un hashtag. À droite, la balise s'arrête
/// au premier caractère qui n'est ni lettre, ni chiffre, ni `_`.
nonisolated enum ComposerHashtags {

    /// La balise, sans son `#`, telle qu'elle voyage.
    ///
    /// **Comparée en minuscules, RENDUE telle qu'écrite.** `#Voyage` et
    /// `#voyage` sont le même hashtag pour le serveur ; les afficher deux fois
    /// dans la feuille ferait croire à l'auteur qu'il en a posé deux.
    static func tags(in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(
            pattern: "(?<![\\p{L}\\p{N}_])#([\\p{L}\\p{N}_]+)"
        ) else { return [] }
        let plage = NSRange(text.startIndex..<text.endIndex, in: text)
        var vues: Set<String> = []
        var ordonnes: [String] = []
        for match in regex.matches(in: text, range: plage) {
            guard match.numberOfRanges > 1,
                  let r = Range(match.range(at: 1), in: text) else { continue }
            let balise = String(text[r])
            guard vues.insert(balise.lowercased()).inserted else { continue }
            ordonnes.append(balise)
        }
        return ordonnes
    }

    /// **Ce que l'outil INSÈRE.** Il ne pose pas un objet : il écrit dans le
    /// texte de la publication, à la fin, précédé d'une espace s'il en manque
    /// une. C'est ce qui garde la dérivation ci-dessus comme SEULE source.
    ///
    /// Une balise déjà présente n'est pas réécrite — insérer `#voyage` deux fois
    /// ne produirait pas deux hashtags, seulement un texte qui bégaie.
    static func inserting(_ tag: String, into text: String) -> String {
        let propre = tag.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        guard !propre.isEmpty else { return text }
        guard !tags(in: text).contains(where: { $0.lowercased() == propre.lowercased() })
        else { return text }
        guard !text.isEmpty else { return "#\(propre)" }
        let separateur = text.last?.isWhitespace == true ? "" : " "
        return "\(text)\(separateur)#\(propre)"
    }

    /// Retire une balise du texte, avec l'espace qu'elle laisserait derrière
    /// elle — la jumelle exacte de `ComposerMentionQuery.removingHandle`.
    static func removing(_ tag: String, from text: String) -> String {
        let echappe = NSRegularExpression.escapedPattern(for: tag)
        guard let regex = try? NSRegularExpression(
            pattern: "(?<![\\p{L}\\p{N}_])#\(echappe)(?![\\p{L}\\p{N}_])\\s?",
            options: [.caseInsensitive]
        ) else { return text }
        let plage = NSRange(text.startIndex..<text.endIndex, in: text)
        return regex.stringByReplacingMatches(in: text, range: plage, withTemplate: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Les mots de la feuille d'audience et de sa section hashtag (#4636).
///
/// Ils vivent ICI et non dans le corps des vues : une chaîne composée dans un
/// `body` est hors de portée d'un témoin, et c'est du vocabulaire produit.
nonisolated enum ComposerAudienceCopy {

    static var title: String {
        String(localized: "composer.audience.title", defaultValue: "Audience", bundle: .main)
    }

    static var apply: String {
        String(localized: "composer.audience.apply", defaultValue: "Appliquer", bundle: .main)
    }

    /// **La note de la planche `2l`, mot pour mot.** Elle répond à la question
    /// que l'écran fait naître — « si je change de format, est-ce que je perds
    /// mon audience ? » — avant qu'on ait à l'essayer.
    static var scopeNote: String {
        String(localized: "composer.audience.scope",
               defaultValue: "L'audience appartient à la publication, jamais à une slide : changer de profil la conserve.",
               bundle: .main)
    }

    static var mentionsSection: String {
        String(localized: "composer.audience.mentions", defaultValue: "MENTIONS", bundle: .main)
    }

    static var hashtagsSection: String {
        String(localized: "composer.audience.hashtags", defaultValue: "HASHTAGS", bundle: .main)
    }

    /// **L'avertissement qui justifie que les mentions vivent SUR cet écran.**
    ///
    /// Une personne mentionnée hors de l'audience ne verra jamais sa mention :
    /// c'est le seul écran où les deux faits se rencontrent, donc le seul où on
    /// puisse le dire à temps.
    static var mentionOutsideAudience: String {
        String(localized: "composer.audience.mention.outside",
               defaultValue: "Hors de l'audience choisie — cette personne ne verra pas sa mention.",
               bundle: .main)
    }

    static var noMentions: String {
        String(localized: "composer.audience.mentions.none",
               defaultValue: "Aucune mention", bundle: .main)
    }

    static var noHashtags: String {
        String(localized: "composer.audience.hashtags.none",
               defaultValue: "Aucun hashtag", bundle: .main)
    }

    /// Le mode d'une mention, en toutes lettres. Le porteur l'a demandé
    /// explicitement : « avec précision du mode ».
    static func mentionMode(_ display: PostReferenceDisplay) -> String {
        switch display {
        case .inline:
            return String(localized: "composer.audience.mention.inline",
                          defaultValue: "dans le texte", bundle: .main)
        case .pinned:
            return String(localized: "composer.audience.mention.pinned",
                          defaultValue: "badge sur la scène", bundle: .main)
        case .note:
            return String(localized: "composer.audience.mention.note",
                          defaultValue: "rangée « Avec… »", bundle: .main)
        case .silent:
            return String(localized: "composer.audience.mention.silent",
                          defaultValue: "notifiée seulement", bundle: .main)
        }
    }
}
