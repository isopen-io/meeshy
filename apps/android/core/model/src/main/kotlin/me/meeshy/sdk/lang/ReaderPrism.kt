package me.meeshy.sdk.lang

import java.util.Locale

/**
 * **Le prisme STRICT du lecteur — UNE descente, pour tout ce qui GRAVE ou AFFICHE une
 * traduction.**
 *
 * Rangs 1 → 4 du Prisme Linguistique (`systemLanguage`, `regionalLanguage`,
 * `customDestinationLanguage`, locale appareil), dédoublonnés sans casse, la locale appareil
 * normalisée en code de langue — et AUCUN repli « fr » : une liste vide dit « aucune
 * préférence », et la règle 1 du Prisme sert alors l'ORIGINAL, jamais le premier venu. C'est
 * la différence, voulue, avec [LanguageResolver.preferredContentLanguages], dont le repli
 * « fr » sert les DÉFAUTS de composition (langue proposée au composer), pas la lecture.
 *
 * Miroir de `ReaderPrism.swift` (`packages/MeeshySDK/.../Auth/ReaderPrism.swift`) : deux
 * producteurs vivaient côté iOS (la bulle et le chemin socket) et divergeaient exactement là
 * où rien ne les teste — locale appareil absente du serveur, aucune langue configurée.
 * Une seule fonction ferme la classe entière ; elle alimente [PrismTranslationResolver].
 */
object ReaderPrism {

    /**
     * La locale appareil qui entre au rang 4 : celle que la passerelle a persistée
     * (`User.deviceLocale`, en-tête `X-Device-Locale`) quand elle l'a, sinon celle de
     * l'appareil lui-même — au démarrage à froid, le serveur n'a pas encore vu ce client.
     * `null` quand ni l'une ni l'autre ne porte de langue.
     */
    fun deviceLocale(stored: String?, current: Locale = Locale.getDefault()): String? =
        stored?.takeIf { it.isNotBlank() } ?: current.language.takeIf { it.isNotBlank() }

    /**
     * Le prisme du lecteur décrit par [prefs]. Pure : seule `prefs.deviceLocale` entre au
     * rang 4, sans consulter la locale de l'appareil — un résultat qui dépendrait du JVM
     * hôte ne serait pas rejouable. Voir la surcharge à [current] pour le démarrage à froid.
     */
    fun resolve(prefs: LanguageResolver.ContentLanguagePreferences): List<String> =
        resolve(
            systemLanguage = prefs.systemLanguage,
            regionalLanguage = prefs.regionalLanguage,
            customDestinationLanguage = prefs.customDestinationLanguage,
            deviceLocale = prefs.deviceLocale,
        )

    /**
     * Le prisme d'un lecteur dont le serveur n'a peut-être pas encore vu l'appareil :
     * `prefs.deviceLocale` quand la passerelle l'a persistée, la langue de [current] sinon.
     * Sans session (participant anonyme), la locale de l'appareil seule — il lit dans sa
     * langue quand une traduction existe, l'original sinon.
     */
    fun resolve(prefs: LanguageResolver.ContentLanguagePreferences, current: Locale): List<String> =
        resolve(
            systemLanguage = prefs.systemLanguage,
            regionalLanguage = prefs.regionalLanguage,
            customDestinationLanguage = prefs.customDestinationLanguage,
            deviceLocale = deviceLocale(stored = prefs.deviceLocale, current = current),
        )

    /**
     * La descente elle-même, pure : quatre rangs dans l'ORDRE, chacun ignoré s'il est vide ou
     * déjà servi (comparaison sans casse — la première orthographe gagne), la locale appareil
     * normalisée par [LanguageCodeNormalizer] et ignorée si elle ne se normalise pas. Les
     * codes configurés dans l'application restent verbatim (rognés) : la comparaison avec le
     * contenu canonise de son côté, dans [PrismTranslationResolver].
     */
    fun resolve(
        systemLanguage: String?,
        regionalLanguage: String?,
        customDestinationLanguage: String?,
        deviceLocale: String?,
    ): List<String> =
        listOf(
            systemLanguage?.trim(),
            regionalLanguage?.trim(),
            customDestinationLanguage?.trim(),
            LanguageCodeNormalizer.normalize(deviceLocale),
        ).fold(emptyList<String>()) { prism, candidate ->
            if (candidate.isNullOrEmpty() || prism.any { it.equals(candidate, ignoreCase = true) }) {
                prism
            } else {
                prism + candidate
            }
        }
}
