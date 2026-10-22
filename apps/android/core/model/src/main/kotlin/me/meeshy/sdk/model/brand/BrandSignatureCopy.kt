package me.meeshy.sdk.model.brand

/**
 * Les mots de la signature de marque (iOS `BrandSignature`) : la ligne de version
 * « Meeshy <version> · <build> » et le crédit « by services.ceo ».
 *
 * Le crédit est une MARQUE (#10096) : identique dans toutes les langues, donc une constante
 * et non une clé de catalogue ; le pied du web lit la même chaîne (`BRAND_CREDIT`,
 * `apps/web/src/lib/brand.ts`). Le toucher ouvre la plateforme dans le navigateur.
 */
object BrandSignatureCopy {
    const val CREDIT: String = "by services.ceo"
    const val CREDIT_URL: String = "https://services.ceo"

    private const val FALLBACK_VERSION = "1.0.0"
    private const val FALLBACK_BUILD = "1"

    /** La version et le build tels qu'on les affiche — un repli iOS quand l'un manque ou est blanc. */
    data class Stamp(val version: String, val build: String) {
        val line: String get() = "Meeshy $version · $build"
    }

    fun stamp(version: String?, build: String?): Stamp = Stamp(
        version = version.orFallback(FALLBACK_VERSION),
        build = build.orFallback(FALLBACK_BUILD),
    )

    fun versionLine(version: String?, build: String?): String = stamp(version, build).line

    private fun String?.orFallback(fallback: String): String = this?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
}
