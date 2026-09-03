import Foundation

/// Ce que la descente du Prisme a SERVI : la langue élue et son texte.
public struct PrismTranslation: Equatable, Sendable {
    /// La clé BRUTE de la carte, telle que le fil l'a écrite (`"fr"`, mais
    /// aussi `"fr-CA"` sur un message antérieur à la canonisation à
    /// l'écriture) — jamais sa forme canonique. Même choix que le jumeau TS,
    /// qui rend `{ language: lang }` depuis `Object.entries` : un appelant qui
    /// DIT dans quelle langue il sert doit pouvoir nommer la variante servie.
    public let language: String
    public let text: String

    public init(language: String, text: String) {
        self.language = language
        self.text = text
    }
}

/// La descente du Prisme Linguistique, écrite UNE fois côté iOS — miroir de
/// `resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`).
///
/// C'est la RÉÉCRITURE de cette boucle qui a produit trois familles de
/// résolveurs divergentes en trois cycles (aperçu de liste, audio, posts) :
/// tout consommateur qui doit dire dans quelle langue il sert l'appelle au
/// lieu de la réécrire. `MeeshyConversation.resolvedLastMessagePreview` en est
/// une projection ; la citation (`APIMessageReplyTo.toReplyReference`) une
/// autre.
///
/// Règles, dans l'ordre où elles se vérifient :
/// 1. les langues du lecteur sont parcourues DANS L'ORDRE, la première servie
///    gagne — par une traduction, ou parce que le contenu est déjà écrit dedans
///    (la langue d'origine concourt à son RANG, jamais en court-circuit) ;
/// 2. `nil` ⇒ servir l'ORIGINAL. JAMAIS `translations.first` : l'absence de
///    traduction vers une langue préférée signifie que le contenu est déjà
///    dans cette langue, ou qu'aucune traduction n'a été produite — servir une
///    langue étrangère serait pire que l'original ;
/// 3. une traduction VIDE n'est pas une traduction : la descente la saute
///    (le TS : `text.trim() === '' → continue`) ;
/// 4. chaque code comparé — langues du lecteur, langue d'origine, clés de la
///    carte — passe par `MeeshyUser.normalizeLanguageForDedup`, sans quoi un
///    `en-US` ne rencontre jamais le rang `en` et une traduction de rang
///    inférieur gagne, rétrogradant la langue PRIMAIRE du lecteur ;
/// 5. deux clés qui se canonisent pareil sont départagées par leur CONTENU et
///    jamais par l'ordre du dictionnaire, qui n'existe pas en Swift — voir
///    `prefers(_:over:canonical:)`.
public enum PrismTranslationResolver {
    public static func resolve(
        originalLanguage: String?,
        translations: [String: String],
        preferredLanguages: [String]
    ) -> PrismTranslation? {
        guard !translations.isEmpty else { return nil }
        let canon: (String) -> String = { MeeshyUser.normalizeLanguageForDedup($0) }
        let isBlank: (String) -> Bool = { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let preferred = preferredLanguages.filter { !isBlank($0) }.map(canon)
        guard !preferred.isEmpty else { return nil }
        let original = originalLanguage.map(canon)
        var byCanonicalKey: [String: PrismTranslation] = [:]
        for (language, text) in translations where !isBlank(text) {
            let key = canon(language)
            guard let held = byCanonicalKey[key] else {
                byCanonicalKey[key] = PrismTranslation(language: language, text: text)
                continue
            }
            guard Self.prefers(language, over: held.language, canonical: key) else { continue }
            byCanonicalKey[key] = PrismTranslation(language: language, text: text)
        }
        for lang in preferred {
            if let original, lang == original { return nil }
            if let translated = byCanonicalKey[lang] { return translated }
        }
        return nil
    }

    /// Départage deux clés qui se canonisent PAREIL — `"fr"` et `"fr-CA"`
    /// coexistent sur le fil, les messages écrits avant la canonisation à
    /// l'écriture portant encore leur région (`en-US`, `pt-BR`).
    ///
    /// Le jumeau TS garde la PREMIÈRE de `Object.entries`, donc l'ordre
    /// d'insertion du document Mongo — stable pour une charge donnée. Un
    /// `Dictionary` Swift n'a AUCUN ordre : écrire la dernière rencontrée
    /// ferait rendre à la MÊME charge deux textes différents d'un lancement à
    /// l'autre, et le témoin qui l'attraperait serait intermittent. La règle
    /// est donc de CONTENU, jamais d'ordre : la clé DÉJÀ canonique gagne —
    /// c'est celle que le lecteur a demandée — et, à défaut, la plus petite
    /// lexicographiquement, arbitraire mais STABLE.
    private static func prefers(_ challenger: String, over held: String, canonical: String) -> Bool {
        let challengerIsCanonical = challenger == canonical
        let heldIsCanonical = held == canonical
        guard challengerIsCanonical == heldIsCanonical else { return challengerIsCanonical }
        return challenger < held
    }
}
