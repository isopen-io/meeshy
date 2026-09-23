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

/// Une CANDIDATE de la descente : la clé de langue BRUTE telle que le fil l'a
/// écrite, et ce qu'elle sert.
///
/// Le Prisme s'applique à TOUT le contenu (§ Cohérence du `CLAUDE.md`), et ce
/// contenu n'est pas toujours une chaîne : la piste audio d'une story sert un
/// `postMediaId`, sa transcription un objet entier. Ces familles réécrivaient
/// donc la boucle « pour chaque langue du lecteur, la première servie gagne »
/// chez elles, parce que le résolveur ne savait parler que de texte — et
/// chacune y perdait une règle au passage (la langue d'origine à son rang, le
/// saut d'une traduction VIDE, le départage déterministe de deux clés qui se
/// canonisent pareil). Générique, la descente les sert toutes.
public struct PrismCandidate<Value> {
    /// La clé BRUTE de la source (`"fr"`, mais aussi `"fr-CA"`), jamais sa
    /// forme canonique : la comparaison se normalise, la valeur rendue non.
    public let language: String
    public let value: Value

    public init(language: String, value: Value) {
        self.language = language
        self.value = value
    }
}

extension PrismCandidate: Sendable where Value: Sendable {}
extension PrismCandidate: Equatable where Value: Equatable {}

/// La descente du Prisme Linguistique, écrite UNE fois côté iOS — miroir de
/// `resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`).
///
/// C'est la RÉÉCRITURE de cette boucle qui a produit trois familles de
/// résolveurs divergentes en trois cycles (aperçu de liste, audio, posts), puis
/// sept jumelles de plus dans le SDK — story (texte, contenu legacy aux deux
/// signatures, piste audio, transcription) et posts (corps + badge de langue).
/// Tout consommateur l'appelle au lieu de la réécrire.
/// `MeeshyConversation.resolvedLastMessagePreview` en est une projection ; la
/// citation (`APIMessageReplyTo.toReplyReference`) une autre.
///
/// Règles, dans l'ordre où elles se vérifient :
/// 1. les langues du lecteur sont parcourues DANS L'ORDRE, la première servie
///    gagne — par une traduction, ou parce que le contenu est déjà écrit dedans
///    (la langue d'origine concourt à son RANG, jamais en court-circuit) ;
/// 2. `nil` ⇒ servir l'ORIGINAL. JAMAIS `translations.first` : l'absence de
///    traduction vers une langue préférée signifie que le contenu est déjà
///    dans cette langue, ou qu'aucune traduction n'a été produite — servir une
///    langue étrangère serait pire que l'original ;
/// 3. une entrée VIDE n'est pas une traduction : la descente la saute, et le
///    rang qu'elle occupait retombe sur la langue suivante (le TS :
///    `text.trim() === '' → continue`). Ce que « vide » veut dire dépend du
///    médium, d'où le prédicat `isServable` de la signature générique ;
/// 4. chaque code comparé — langues du lecteur, langue d'origine, clés de la
///    carte — passe par `MeeshyUser.normalizeLanguageForDedup`, sans quoi un
///    `en-US` ne rencontre jamais le rang `en` et une traduction de rang
///    inférieur gagne, rétrogradant la langue PRIMAIRE du lecteur ;
/// 5. deux clés qui se canonisent pareil sont départagées par leur CONTENU et
///    jamais par l'ordre du dictionnaire, qui n'existe pas en Swift — voir
///    `prefers(_:over:canonical:)`.
public enum PrismTranslationResolver {
    /// La descente, générique sur le MÉDIUM servi — le SITE UNIQUE de la
    /// boucle. Toutes les autres signatures de ce type en sont des
    /// projections ; aucune ne réécrit le parcours.
    ///
    /// - Parameter isServable: ce qui fait qu'une candidate COMPTE. La règle 3
    ///   (« une traduction VIDE n'est pas une traduction ») n'est pas
    ///   exprimable sur un `Value` opaque : chaque médium dit ce que « vide »
    ///   veut dire chez lui. Une candidate non servable est écartée AVANT le
    ///   parcours, donc le rang qu'elle occupait retombe sur la langue
    ///   suivante — jamais sur un texte blanc rendu à l'écran.
    public static func resolve<Value>(
        originalLanguage: String?,
        candidates: [PrismCandidate<Value>],
        preferredLanguages: [String],
        isServable: (Value) -> Bool
    ) -> PrismCandidate<Value>? {
        guard !candidates.isEmpty else { return nil }
        let canon: (String) -> String = { MeeshyUser.normalizeLanguageForDedup($0) }
        let preferred = preferredLanguages.filter { !Self.isBlank($0) }.map(canon)
        guard !preferred.isEmpty else { return nil }
        let original = originalLanguage.map(canon)
        var byCanonicalKey: [String: PrismCandidate<Value>] = [:]
        for candidate in candidates where isServable(candidate.value) {
            let key = canon(candidate.language)
            guard let held = byCanonicalKey[key] else {
                byCanonicalKey[key] = candidate
                continue
            }
            guard Self.prefers(candidate.language, over: held.language, canonical: key) else { continue }
            byCanonicalKey[key] = candidate
        }
        for lang in preferred {
            if let original, lang == original { return nil }
            if let served = byCanonicalKey[lang] { return served }
        }
        return nil
    }

    /// Projection TEXTE de la descente générique : « servable » y veut dire
    /// non blanc (règle 3), et la paire rendue est nommée `{language, text}`.
    public static func resolve(
        originalLanguage: String?,
        candidates: [PrismCandidate<String>],
        preferredLanguages: [String]
    ) -> PrismTranslation? {
        resolve(
            originalLanguage: originalLanguage,
            candidates: candidates,
            preferredLanguages: preferredLanguages,
            isServable: { !Self.isBlank($0) }
        ).map { PrismTranslation(language: $0.language, text: $0.value) }
    }

    /// Projection CARTE de la descente — la forme historique, celle qu'attend
    /// un `langue → texte` déjà dépouillé.
    public static func resolve(
        originalLanguage: String?,
        translations: [String: String],
        preferredLanguages: [String]
    ) -> PrismTranslation? {
        resolve(
            originalLanguage: originalLanguage,
            candidates: translations.map { PrismCandidate(language: $0.key, value: $0.value) },
            preferredLanguages: preferredLanguages
        )
    }

    private static func isBlank(_ text: String) -> Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
