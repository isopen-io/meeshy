package me.meeshy.sdk.model

import java.text.NumberFormat
import java.util.Locale

/** Une ligne de la légende : le nom et le pourcentage sont DEUX textes (l'inversion en RTL). */
data class LanguageShareLegendEntry(
    val code: String,
    val name: String,
    val percentLabel: String?,
    val colorHex: String?,
    val fraction: Double,
) {
    val spoken: String get() = listOfNotNull(name, percentLabel).joinToString(" ")
}

/** La légende de la barre des langues : au plus six segments, autonymes, pourcentage si mesuré. */
data class LanguageShareLegend(val entries: List<LanguageShareLegendEntry>) {
    val accessibilitySummary: String get() = entries.joinToString(", ") { it.spoken }

    companion object {
        fun from(shares: List<InviteLanguageShare>, locale: Locale = Locale.getDefault()): LanguageShareLegend {
            val percent = NumberFormat.getPercentInstance(locale)
            return LanguageShareLegend(
                InviteLanguageShare.visible(shares).map { share ->
                    LanguageShareLegendEntry(
                        code = share.code,
                        name = if (share.code.isEmpty()) "…" else LanguageData.autonym(share.code),
                        percentLabel = if (share.isMeasured) percent.format(share.percent / 100.0) else null,
                        colorHex = share.code.takeIf { it.isNotEmpty() }?.let { LanguageData.colorHex(it) },
                        fraction = share.fraction,
                    )
                },
            )
        }
    }
}
