package me.meeshy.sdk.model.composer

import java.text.NumberFormat
import java.util.Locale

/** Ce que la vue 4c dit de l'état d'un asset — miroir d'iOS `ComposerPreUploadCopy`. */
object ComposerPreUploadCopy {
    /** Unités localisées, fournies par les ressources (« ko/Mo/Go » en français). */
    data class ByteUnits(val kb: String, val mb: String, val gb: String)

    /** « MONTÉE EN COURS · 34 % — 4,8 / 14,2 Mo », ou `null` : prêt, repos et échec ne disent rien. */
    fun label(state: ComposerPreUploadState, header: String, units: ByteUnits, locale: Locale): String? {
        val uploading = state as? ComposerPreUploadState.Uploading ?: return null
        val percent = NumberFormat.getPercentInstance(locale).apply { maximumFractionDigits = 0 }
            .format(Math.round((state.fraction ?: 0.0) * 100) / 100.0)
            .replace(Regex("[\\s\u202f]"), "\u00a0")
        return "$header · $percent — ${bytes(uploading.sent, uploading.total, units, locale)}"
    }

    /** « 4,8 / 14,2 Mo » : l'unité une fois, l'échelle choisie sur le total. */
    fun bytes(sent: Long, total: Long, units: ByteUnits, locale: Locale): String {
        val safeTotal = total.coerceAtLeast(0)
        val (divisor, unit) = when {
            safeTotal >= 1_000_000_000 -> 1_000_000_000.0 to units.gb
            safeTotal >= 1_000_000 -> 1_000_000.0 to units.mb
            else -> 1_000.0 to units.kb
        }
        val format = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1; minimumFractionDigits = 0 }
        val sentText = format.format(sent.coerceIn(0, safeTotal) / divisor)
        return "$sentText / ${format.format(safeTotal / divisor)} $unit"
    }
}
