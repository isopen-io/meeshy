package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.LanguageData

/** Which secondary identity field a [ProfileDetailRow] describes. */
enum class ProfileDetailKind { SYSTEM_LANGUAGE, REGIONAL_LANGUAGE, COUNTRY, TIMEZONE }

/**
 * One secondary identity row under the profile header — a flag glyph (when one
 * can be resolved) plus a display value. Port of the details region of the iOS
 * `UserProfileSheet` identity block.
 */
@Immutable
data class ProfileDetailRow(
    val kind: ProfileDetailKind,
    val flag: String?,
    val value: String,
)

/**
 * Projects a [ProfileHeaderPresentation] into the ordered list of secondary
 * identity rows the profile sheet renders (languages, country, timezone).
 *
 * Pure — every derivation is unit-testable without Compose. Flags/labels come
 * from the [LanguageData] SSOT (languages) and regional-indicator composition
 * (country codes); no re-implementation of either table.
 */
object ProfileDetailRows {

    fun build(header: ProfileHeaderPresentation): List<ProfileDetailRow> = buildList {
        val system = header.systemLanguage?.takeIf { it.isNotBlank() }
        system?.let { add(languageRow(ProfileDetailKind.SYSTEM_LANGUAGE, it)) }

        header.regionalLanguage
            ?.takeIf { it.isNotBlank() && !it.equals(system, ignoreCase = true) }
            ?.let { add(languageRow(ProfileDetailKind.REGIONAL_LANGUAGE, it)) }

        header.country
            ?.takeIf { it.isNotBlank() }
            ?.let { add(countryRow(it)) }

        header.timezone
            ?.takeIf { it.isNotBlank() }
            ?.let { add(ProfileDetailRow(ProfileDetailKind.TIMEZONE, flag = null, value = it)) }
    }

    private fun languageRow(kind: ProfileDetailKind, code: String): ProfileDetailRow {
        val info = LanguageData.info(code)
        return ProfileDetailRow(
            kind = kind,
            flag = info?.flag,
            value = info?.name ?: code.uppercase(),
        )
    }

    private fun countryRow(code: String): ProfileDetailRow {
        val trimmed = code.trim()
        val flag = countryFlagEmoji(trimmed)
        return ProfileDetailRow(
            kind = ProfileDetailKind.COUNTRY,
            flag = flag,
            value = if (flag != null) trimmed.uppercase() else trimmed,
        )
    }

    /**
     * The regional-indicator flag for an ISO-3166 alpha-2 code, or null when the
     * value is not exactly two ASCII letters (a full country name, a numeric code,
     * etc. — rendered as plain text with no flag).
     */
    private fun countryFlagEmoji(code: String): String? {
        if (code.length != 2 || !code.all { it in 'A'..'Z' || it in 'a'..'z' }) return null
        val upper = code.uppercase()
        val base = 0x1F1E6
        val first = base + (upper[0] - 'A')
        val second = base + (upper[1] - 'A')
        return String(Character.toChars(first)) + String(Character.toChars(second))
    }
}
