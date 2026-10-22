package me.meeshy.sdk.lang

/**
 * Ce que la descente du Prisme a SERVI : la langue élue et son texte.
 *
 * [language] est la clé BRUTE de la source, telle que le fil l'a écrite (`"fr"`, mais aussi
 * `"fr-CA"` sur un message antérieur à la canonisation à l'écriture) — jamais sa forme
 * canonique. Même choix que le jumeau TS, qui rend `{ language: lang }` depuis
 * `Object.entries` : un appelant qui DIT dans quelle langue il sert doit pouvoir nommer la
 * variante servie.
 */
data class PrismTranslation(
    val language: String,
    val text: String,
)

/**
 * Une CANDIDATE de la descente : la clé de langue BRUTE telle que le fil l'a écrite, et ce
 * qu'elle sert.
 *
 * Le Prisme s'applique à TOUT le contenu, et ce contenu n'est pas toujours une chaîne : la
 * piste audio d'une story sert un `postMediaId`, sa transcription un objet entier. Ces
 * familles réécrivaient donc la boucle « pour chaque langue du lecteur, la première servie
 * gagne » chez elles, parce que le résolveur ne savait parler que de texte — et chacune y
 * perdait une règle au passage (la langue d'origine à son rang, le saut d'une traduction
 * VIDE, le départage déterministe de deux clés qui se canonisent pareil). Générique, la
 * descente les sert toutes.
 *
 * [language] est la clé BRUTE : la comparaison se normalise, la valeur rendue non.
 */
data class PrismCandidate<out V>(
    val language: String,
    val value: V,
)

/**
 * La descente du Prisme Linguistique, écrite UNE fois côté Android — troisième miroir de la
 * loi, avec `resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`,
 * qui fait foi) et `PrismTranslationResolver` (`packages/MeeshySDK/.../Models/`, iOS).
 *
 * C'est la RÉÉCRITURE de cette boucle qui a produit des familles de résolveurs divergentes
 * en plusieurs cycles (aperçu de liste, audio, posts, story). Tout consommateur l'appelle au
 * lieu de la réécrire ; [LanguageResolver.preferredTranslation] en est une projection.
 *
 * Règles, dans l'ordre où elles se vérifient :
 * 1. les langues du lecteur sont parcourues DANS L'ORDRE, la première servie gagne — par une
 *    traduction, ou parce que le contenu est déjà écrit dedans (la langue d'origine concourt
 *    à son RANG, jamais en court-circuit) ;
 * 2. `null` ⇒ servir l'ORIGINAL. JAMAIS `translations.first()` : l'absence de traduction vers
 *    une langue préférée signifie que le contenu est déjà dans cette langue, ou qu'aucune
 *    traduction n'a été produite — servir une langue étrangère serait pire que l'original ;
 * 3. une entrée VIDE n'est pas une traduction : la descente la saute, et le rang qu'elle
 *    occupait retombe sur la langue suivante (TS : `text.trim() === '' → continue`). Ce que
 *    « vide » veut dire dépend du médium, d'où le prédicat `isServable` de la signature
 *    générique ;
 * 4. chaque code comparé — langues du lecteur, langue d'origine, clés de la carte — passe par
 *    [LanguageCodeNormalizer.normalizeForDedup] (casse ET région), sans quoi un `en-US` ne
 *    rencontre jamais le rang `en` et une traduction de rang inférieur gagne, rétrogradant la
 *    langue PRIMAIRE du lecteur ;
 * 5. deux clés qui se canonisent pareil sont départagées par leur CONTENU, jamais par l'ordre
 *    d'insertion — voir [prefers].
 */
object PrismTranslationResolver {

    /**
     * La descente, générique sur le MÉDIUM servi — le SITE UNIQUE de la boucle. Toutes les
     * autres signatures de ce type en sont des projections ; aucune ne réécrit le parcours.
     *
     * @param isServable ce qui fait qu'une candidate COMPTE. La règle 3 (« une traduction
     *   VIDE n'est pas une traduction ») n'est pas exprimable sur un `V` opaque : chaque
     *   médium dit ce que « vide » veut dire chez lui. Une candidate non servable est écartée
     *   AVANT le parcours, donc le rang qu'elle occupait retombe sur la langue suivante —
     *   jamais sur un texte blanc rendu à l'écran.
     */
    fun <V> resolve(
        originalLanguage: String?,
        candidates: List<PrismCandidate<V>>,
        preferredLanguages: List<String>,
        isServable: (V) -> Boolean,
    ): PrismCandidate<V>? {
        if (candidates.isEmpty()) return null

        val preferred = preferredLanguages
            .filter { it.isNotBlank() }
            .map(LanguageCodeNormalizer::normalizeForDedup)
        if (preferred.isEmpty()) return null

        val original = originalLanguage
            ?.takeIf { it.isNotBlank() }
            ?.let(LanguageCodeNormalizer::normalizeForDedup)

        val byCanonicalKey = HashMap<String, PrismCandidate<V>>(candidates.size)
        for (candidate in candidates) {
            if (!isServable(candidate.value)) continue
            val key = LanguageCodeNormalizer.normalizeForDedup(candidate.language)
            val held = byCanonicalKey[key]
            if (held == null || prefers(candidate.language, held.language, key)) {
                byCanonicalKey[key] = candidate
            }
        }

        for (language in preferred) {
            if (original != null && language == original) return null
            byCanonicalKey[language]?.let { return it }
        }
        return null
    }

    /**
     * Projection TEXTE de la descente générique : « servable » y veut dire non blanc
     * (règle 3), et la paire rendue est nommée `{language, text}`.
     */
    fun resolve(
        originalLanguage: String?,
        candidates: List<PrismCandidate<String>>,
        preferredLanguages: List<String>,
    ): PrismTranslation? =
        resolve(
            originalLanguage = originalLanguage,
            candidates = candidates,
            preferredLanguages = preferredLanguages,
            isServable = { it.isNotBlank() },
        )?.let { PrismTranslation(language = it.language, text = it.value) }

    /**
     * Projection CARTE de la descente — la forme historique, celle qu'attend un
     * `langue → texte` déjà dépouillé.
     */
    fun resolve(
        originalLanguage: String?,
        translations: Map<String, String>,
        preferredLanguages: List<String>,
    ): PrismTranslation? =
        resolve(
            originalLanguage = originalLanguage,
            candidates = translations.map { (language, text) -> PrismCandidate(language, text) },
            preferredLanguages = preferredLanguages,
        )

    /**
     * Départage deux clés qui se canonisent PAREIL — `"fr"` et `"fr-CA"` coexistent sur le
     * fil, les messages écrits avant la canonisation à l'écriture portant encore leur région
     * (`en-US`, `pt-BR`).
     *
     * Le jumeau TS garde la PREMIÈRE de `Object.entries`, donc l'ordre d'insertion du
     * document Mongo — stable pour une charge donnée. Une carte reconstruite côté client
     * (Room, JSON décodé, fusion de deux sources) n'offre pas cette garantie : garder la
     * dernière ou la première rencontrée ferait rendre à la MÊME charge deux textes
     * différents selon le chemin qui l'a ingérée. La règle est donc de CONTENU, jamais
     * d'ordre : la clé DÉJÀ canonique gagne — c'est celle que le lecteur a demandée — et, à
     * défaut, la plus petite lexicographiquement, arbitraire mais STABLE. Deux clés
     * strictement égales gardent la première rencontrée.
     */
    private fun prefers(challenger: String, held: String, canonical: String): Boolean {
        val challengerIsCanonical = challenger == canonical
        val heldIsCanonical = held == canonical
        if (challengerIsCanonical != heldIsCanonical) return challengerIsCanonical
        return challenger < held
    }
}
