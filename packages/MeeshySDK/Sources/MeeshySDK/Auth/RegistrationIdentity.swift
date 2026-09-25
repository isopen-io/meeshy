import Foundation

/// L'IDENTITÉ DÉRIVÉE D'UNE ADRESSE — miroir STRICT de
/// `packages/shared/utils/registration-identity.ts` (#6479).
///
/// La passerelle RÉEXPORTE ce module TS ; l'écran d'inscription iOS doit donc
/// rendre EXACTEMENT les mêmes valeurs, sans quoi il promettrait un pseudo que
/// le serveur ne crée pas. C'est la raison d'être de ce fichier : un miroir,
/// tenu par les mêmes témoins que l'original.
///
/// Ce qui N'est PAS ici : `generateUsername`, qui négocie avec la base — un
/// pseudo doit être LIBRE, et cette question n'a de réponse que côté serveur.
/// Depuis #6479 l'écran ENVOIE son pseudo, donc une collision revient en refus
/// `USERNAME_TAKEN` accompagné de trois valeurs libres.
public enum RegistrationIdentity {

    /// Longueur maximale d'un `username` — bornée par `registerRequestSchema`.
    public static let pseudoMax = 16
    /// En deçà, un pseudo n'est pas recevable (borne basse du même schéma).
    public static let pseudoMin = 2
    /// Le recours quand le nom affiché ET l'adresse ne donnent rien de slugifiable.
    public static let pseudoDeSecours = "user"

    /// Capitalise un nom en respectant les composés — `"Jean-Pierre"` reste
    /// `"Jean-Pierre"`, `"O'Brien"` reste `"O'Brien"`.
    public static func capitalizeName(_ name: String) -> String {
        let bas = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var resultat = ""
        var debutDeMot = true
        for caractere in bas {
            if debutDeMot, caractere.isLetter {
                resultat.append(contentsOf: String(caractere).uppercased())
                debutDeMot = false
            } else {
                resultat.append(caractere)
                debutDeMot = caractere.isWhitespace || caractere == "'" || caractere == "." || caractere == "-"
            }
        }
        return resultat
    }

    /// L'ORDRE DES ÉTAPES EST LA LOI, pas un détail d'implémentation :
    /// on replie les séparateurs, on RAGNE les bords, PUIS on tronque. Tronquer
    /// avant laisserait un pseudo se terminer par un séparateur ; ragner après
    /// rendrait deux adresses voisines indiscernables.
    public static func pseudoSlug(_ valeur: String) -> String {
        let sansAccents = valeur.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
        var slug = ""
        var precedentEstSeparateur = false
        for caractere in sansAccents.lowercased() {
            let autorise = caractere.isASCII && (caractere.isLetter || caractere.isNumber)
            if autorise {
                slug.append(caractere)
                precedentEstSeparateur = false
            } else if caractere.isWhitespace || caractere == "-" || caractere == "_" {
                if !precedentEstSeparateur { slug.append("-") }
                precedentEstSeparateur = true
            }
        }
        while slug.hasPrefix("-") || slug.hasPrefix("_") { slug.removeFirst() }
        while slug.hasSuffix("-") || slug.hasSuffix("_") { slug.removeLast() }
        return String(slug.prefix(pseudoMax))
    }

    /// Ce qui précède l'arobase, sous-adressage retiré : `jean+meeshy@…` rend
    /// `jean`. Le `+…` ne doit JAMAIS fuir dans l'identité — il porte souvent
    /// le nom du service auquel on s'inscrit.
    public static func partieLocale(_ email: String?) -> String {
        let avantArobase = (email ?? "").split(separator: "@", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        return avantArobase.split(separator: "+", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
    }

    public static func slugDAdresse(_ email: String?) -> String {
        pseudoSlug(partieLocale(email).replacingOccurrences(of: ".", with: "-"))
    }

    /// Découpe un nom affiché en prénom / nom — miroir de `derivedNames`
    /// (TS). Un mononyme rend `lastName == ""` : la colonne l'exige, on
    /// n'invente pas un nom de famille (#7897 : l'écran en remplit les champs).
    public static func derivedNames(_ displayName: String) -> (firstName: String, lastName: String) {
        let mots = displayName.split(whereSeparator: \.isWhitespace).map(String.init)
        return (
            firstName: capitalizeName(mots.first ?? ""),
            lastName: capitalizeName(mots.dropFirst().joined(separator: " "))
        )
    }

    /// Le nom affiché tiré d'une adresse — `jean.dupont@…` rend `Jean Dupont`.
    /// Rend `""` quand rien n'est slugifiable : l'écran doit alors rendre le
    /// PSEUDO plutôt qu'une promesse vide.
    public static func displayNameDepuisEmail(_ email: String?) -> String {
        let slug = slugDAdresse(email)
        guard slug.count >= pseudoMin else { return "" }
        return slug
            .split(whereSeparator: { $0 == "-" || $0 == "_" })
            .filter { !$0.isEmpty }
            .map { capitalizeName(String($0)) }
            .joined(separator: " ")
    }

    /// La racine du pseudo : le nom affiché s'il donne quelque chose, l'adresse
    /// sinon, le recours en dernier. Un nom affiché FOURNI gagne — l'utilisateur
    /// garde la main.
    public static func pseudoRacine(displayName: String?, email: String?) -> String {
        let depuisNom = pseudoSlug(displayName ?? "")
        if depuisNom.count >= pseudoMin { return depuisNom }
        let depuisEmail = slugDAdresse(email)
        if depuisEmail.count >= pseudoMin { return depuisEmail }
        return pseudoDeSecours
    }
}
