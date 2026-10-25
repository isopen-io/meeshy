package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.CountryFlag
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.UserStats
import java.util.Locale

/** Une pastille de langue de « À propos » : drapeau et nom de la langue écrit dans cette langue. */
@Immutable
data class ProfileLanguagePill(val code: String, val flag: String, val name: String)

/** La puce pays de « À propos » : drapeau (vide si le code n'en a pas) et nom dans la langue de l'appareil. */
@Immutable
data class ProfileCountryChip(val code: String, val flag: String, val name: String)

/**
 * La section « À propos » de l'onglet Détails (miroir de `aboutSection` iOS) : bio, pastilles de
 * langue, puces fuseau et pays, badge E2EE et anneau de complétude borné à `0..100`.
 */
@Immutable
data class ProfileAboutPresentation(
    val bio: String?,
    val languages: List<ProfileLanguagePill>,
    val timezone: String?,
    val country: ProfileCountryChip?,
    val hasE2EE: Boolean,
    val completionPercent: Int?,
)

/** Les quatre puces de la bande de statistiques d'un tiers, dans l'ordre iOS. */
enum class ProfileStatChipKind { MESSAGES, TRANSLATIONS, LANGUAGES, DAYS }

@Immutable
data class ProfileStatChip(val kind: ProfileStatChipKind, val value: Int)

/** Ce que la bande montre sous « Membre depuis » : les quatre puces, ou leur squelette. */
sealed interface ProfileStatChips {
    @Immutable
    data class Shown(val chips: List<ProfileStatChip>) : ProfileStatChips

    /** Statistiques en chargement sur cache vide : quatre blocs de 56 dp qui respirent. */
    data object Loading : ProfileStatChips
}

/**
 * La bande compacte de statistiques (miroir de `compactStatsBand` iOS) : la ligne « Membre depuis »
 * quand l'ancienneté est connue, puis les puces. Pas de succès : le tableau complet reste à mon écran
 * Statistiques.
 */
@Immutable
data class ProfileCompactStats(
    val memberSinceEpochMillis: Long?,
    val chips: ProfileStatChips?,
)

/** L'onglet Détails projeté : chaque section absente est `null` et n'est pas dessinée. */
@Immutable
data class ProfileDetailsPresentation(
    val about: ProfileAboutPresentation?,
    val voice: ProfileVoiceSample?,
    val stats: ProfileCompactStats?,
)

/**
 * Projette l'en-tête et les statistiques du document de profil en [ProfileDetailsPresentation].
 * Pur et déterministe : la langue de l'appareil est un paramètre, aucune horloge, aucun réseau.
 */
object ProfileDetailsBuilder {

    fun build(
        header: ProfileHeaderPresentation,
        stats: UserStats?,
        isLoadingStats: Boolean,
        locale: Locale = Locale.getDefault(),
    ): ProfileDetailsPresentation = ProfileDetailsPresentation(
        about = about(header, locale),
        voice = header.voiceSample,
        stats = compactStats(header.memberSinceEpochMillis, stats, isLoadingStats),
    )

    /**
     * « À propos » n'existe que s'il y a une bio, une puce (fuseau ou pays), le badge E2EE ou un taux
     * de complétude — des langues seules ne l'ouvrent pas, comme sur iOS.
     */
    fun about(header: ProfileHeaderPresentation, locale: Locale = Locale.getDefault()): ProfileAboutPresentation? {
        val bio = header.bio?.takeIf { it.isNotBlank() }
        val timezone = header.timezone?.trim()?.takeIf { it.isNotEmpty() }
        val country = header.country?.let { countryChip(it, locale) }
        val completion = header.completionPercent?.coerceIn(0, 100)
        val opens = bio != null || timezone != null || country != null || header.hasE2EE || completion != null
        if (!opens) return null
        return ProfileAboutPresentation(
            bio = bio,
            languages = languagePills(header.systemLanguage, header.regionalLanguage),
            timezone = timezone,
            country = country,
            hasE2EE = header.hasE2EE,
            completionPercent = completion,
        )
    }

    /** Langue système puis régionale, sans doublon ; un code inconnu du catalogue n'a pas de pastille. */
    fun languagePills(systemLanguage: String?, regionalLanguage: String?): List<ProfileLanguagePill> =
        listOfNotNull(systemLanguage, regionalLanguage)
            .mapNotNull { LanguageData.info(it) }
            .distinctBy { it.code }
            .map { ProfileLanguagePill(code = it.code, flag = it.flag, name = it.nativeName) }

    /** La bande, ou `null` quand il n'y a ni ancienneté, ni statistiques, ni chargement en cours. */
    fun compactStats(memberSinceEpochMillis: Long?, stats: UserStats?, isLoadingStats: Boolean): ProfileCompactStats? {
        val chips: ProfileStatChips? = when {
            stats != null -> ProfileStatChips.Shown(chips(stats))
            isLoadingStats -> ProfileStatChips.Loading
            else -> null
        }
        if (memberSinceEpochMillis == null && chips == null) return null
        return ProfileCompactStats(memberSinceEpochMillis = memberSinceEpochMillis, chips = chips)
    }

    private fun chips(stats: UserStats): List<ProfileStatChip> = listOf(
        ProfileStatChip(ProfileStatChipKind.MESSAGES, stats.totalMessages.coerceAtLeast(0)),
        ProfileStatChip(ProfileStatChipKind.TRANSLATIONS, stats.totalTranslations.coerceAtLeast(0)),
        ProfileStatChip(ProfileStatChipKind.LANGUAGES, stats.languagesUsed.coerceAtLeast(0)),
        ProfileStatChip(ProfileStatChipKind.DAYS, stats.memberDays.coerceAtLeast(0)),
    )

    private fun countryChip(raw: String, locale: Locale): ProfileCountryChip? {
        val code = raw.trim().takeIf { it.isNotEmpty() } ?: return null
        val flag = CountryFlag.emoji(code)
        val name = if (flag.isEmpty()) code else countryName(code.uppercase(Locale.ROOT), locale)
        return ProfileCountryChip(code = code, flag = flag, name = name)
    }

    private fun countryName(isoCode: String, locale: Locale): String =
        Locale("", isoCode).getDisplayCountry(locale).takeIf { it.isNotBlank() } ?: isoCode
}
