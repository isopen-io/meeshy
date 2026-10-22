package me.meeshy.sdk.model

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Ce que le formulaire d'arrivée demande à un invité sans compte. */
public enum class ShareLinkAskedField { FirstName, LastName, Nickname, Email, Birthday }

/**
 * Tout ce que le propriétaire d'un lien peut modifier par `PATCH /links/:linkId`
 * (#7797) : un seul type pour la lecture (la carte « Configuration ») et l'écriture
 * (le formulaire), pour qu'ils ne divergent pas. Miroir de `ShareLinkSettings` (iOS).
 *
 * [expiresAt] est l'ISO-8601 servi ; [maxUses] / [maxConcurrentUsers] à `null` disent
 * « illimité » ; [allowedLanguages] vide dit « toutes les langues ».
 */
public data class ShareLinkEditDraft(
    val name: String = "",
    val description: String = "",
    val expiresAt: String? = null,
    val maxUses: Int? = null,
    val maxConcurrentUsers: Int? = null,
    val requireAccount: Boolean = false,
    val requireNickname: Boolean = true,
    val requireEmail: Boolean = false,
    val requireBirthday: Boolean = false,
    val allowedLanguages: List<String> = emptyList(),
    val allowMessages: Boolean = true,
    val allowImages: Boolean = true,
    val allowFiles: Boolean = false,
    val allowHistory: Boolean = true,
) {
    /** Les limites que la passerelle refuserait (`positive()` côté Zod). */
    public val isValid: Boolean
        get() = (maxUses?.let { it >= 1 } ?: true) && (maxConcurrentUsers?.let { it >= 1 } ?: true)

    /** Ce que le formulaire invité demandera : le nom TOUJOURS, puis ce que le lien ajoute. */
    public val askedFields: List<ShareLinkAskedField>
        get() = buildList {
            add(ShareLinkAskedField.FirstName)
            add(ShareLinkAskedField.LastName)
            if (requireNickname) add(ShareLinkAskedField.Nickname)
            if (requireEmail) add(ShareLinkAskedField.Email)
            if (requireBirthday) add(ShareLinkAskedField.Birthday)
        }

    /** Les choix du sélecteur de langues : les rapides, puis celles du lien qui n'en font pas partie. */
    public val languageChoices: List<String>
        get() = QUICK_LANGUAGES + allowedLanguages.filterNot { it in QUICK_LANGUAGES }

    /** « Toutes les langues » = liste vide côté serveur. */
    public val allowsAllLanguages: Boolean get() = allowedLanguages.isEmpty()

    /**
     * Décocher « toutes » sans rien choisir voudrait encore dire « toutes » : on
     * présélectionne [defaultLanguage] pour que la restriction soit visible dès qu'on la demande.
     */
    public fun withAllLanguages(all: Boolean, defaultLanguage: String): ShareLinkEditDraft =
        copy(allowedLanguages = if (all) emptyList() else listOf(defaultLanguage))

    /**
     * Ajoute ou retire [code]. La DERNIÈRE langue ne se retire pas : une liste vide
     * voudrait dire « toutes », l'inverse de ce que la personne restreint.
     */
    public fun toggleLanguage(code: String): ShareLinkEditDraft = when {
        code !in allowedLanguages -> copy(allowedLanguages = allowedLanguages + code)
        allowedLanguages.size > 1 -> copy(allowedLanguages = allowedLanguages - code)
        else -> this
    }

    /** Activer l'échéance propose une semaine ; la désactiver la retire (jamais d'expiration). */
    public fun withExpiryEnabled(enabled: Boolean, nowMillis: Long): ShareLinkEditDraft = copy(
        expiresAt = if (enabled) expiresAt ?: Instant.ofEpochMilli(nowMillis).plus(DEFAULT_EXPIRY).toString() else null,
    )

    /**
     * Change le JOUR de l'échéance en gardant l'heure choisie. [utcDayMillis] est le minuit UTC
     * que rend un sélecteur de date Material ; inerte sans échéance.
     */
    public fun withExpiryDay(utcDayMillis: Long, zone: ZoneId): ShareLinkEditDraft {
        val current = isoToEpochMillisOrNull(expiresAt) ?: return this
        val day = Instant.ofEpochMilli(utcDayMillis).atZone(ZoneOffset.UTC).toLocalDate()
        val time = Instant.ofEpochMilli(current).atZone(zone).toLocalTime()
        return copy(expiresAt = day.atTime(time).atZone(zone).toInstant().toString())
    }

    /** Le champ numérique d'un formulaire : vide = illimité, sinon les seuls chiffres saisis. */
    public fun withMaxUsesInput(raw: String): ShareLinkEditDraft = copy(maxUses = limitFromInput(raw))

    public fun withMaxConcurrentInput(raw: String): ShareLinkEditDraft = copy(maxConcurrentUsers = limitFromInput(raw))

    /**
     * Le corps de `PATCH /links/:linkId` : UNIQUEMENT les champs qui diffèrent de [baseline].
     * Un champ vidé (échéance, limites) part en `null` explicite — omis, la passerelle
     * (`!== undefined`) garderait l'ancienne limite. `null` si rien n'a changé.
     */
    public fun patchAgainst(baseline: ShareLinkEditDraft): JsonObject? {
        val fields = buildMap<String, kotlinx.serialization.json.JsonElement> {
            if (name != baseline.name) put("name", JsonPrimitive(name))
            if (description != baseline.description) put("description", JsonPrimitive(description))
            if (expiresAt != baseline.expiresAt) put("expiresAt", expiresAt.asJson())
            if (maxUses != baseline.maxUses) put("maxUses", maxUses.asJson())
            if (maxConcurrentUsers != baseline.maxConcurrentUsers) put("maxConcurrentUsers", maxConcurrentUsers.asJson())
            if (requireAccount != baseline.requireAccount) put("requireAccount", JsonPrimitive(requireAccount))
            if (requireNickname != baseline.requireNickname) put("requireNickname", JsonPrimitive(requireNickname))
            if (requireEmail != baseline.requireEmail) put("requireEmail", JsonPrimitive(requireEmail))
            if (requireBirthday != baseline.requireBirthday) put("requireBirthday", JsonPrimitive(requireBirthday))
            if (allowedLanguages != baseline.allowedLanguages) {
                put("allowedLanguages", JsonArray(allowedLanguages.map(::JsonPrimitive)))
            }
            if (allowMessages != baseline.allowMessages) put("allowAnonymousMessages", JsonPrimitive(allowMessages))
            if (allowImages != baseline.allowImages) put("allowAnonymousImages", JsonPrimitive(allowImages))
            if (allowFiles != baseline.allowFiles) put("allowAnonymousFiles", JsonPrimitive(allowFiles))
            if (allowHistory != baseline.allowHistory) put("allowViewHistory", JsonPrimitive(allowHistory))
        }
        return fields.takeIf { it.isNotEmpty() }?.let(::JsonObject)
    }

    /** Le lien tel qu'il sera une fois ce brouillon enregistré — la valeur optimiste de la fiche. */
    public fun applyTo(link: MyShareLink): MyShareLink = link.copy(
        name = name.ifEmpty { null },
        description = description.ifEmpty { null },
        expiresAt = expiresAt,
        maxUses = maxUses,
        maxConcurrentUsers = maxConcurrentUsers,
        requireAccount = requireAccount,
        requireNickname = requireNickname,
        requireEmail = requireEmail,
        requireBirthday = requireBirthday,
        allowedLanguages = allowedLanguages,
        allowAnonymousMessages = allowMessages,
        allowAnonymousImages = allowImages,
        allowAnonymousFiles = allowFiles,
        allowViewHistory = allowHistory,
    )

    public companion object {
        /** `LanguageData.quickTranslationCodes` (iOS). */
        public val QUICK_LANGUAGES: List<String> = listOf("fr", "en", "es", "de", "it", "pt", "ja", "zh", "ko", "ar")

        private val DEFAULT_EXPIRY: Duration = Duration.ofDays(7)

        /** La configuration servie, chaque champ absent résolu par son défaut de schéma — jamais inventé. */
        public fun from(link: MyShareLink): ShareLinkEditDraft = ShareLinkEditDraft(
            name = link.name.orEmpty(),
            description = link.description.orEmpty(),
            expiresAt = link.expiresAt,
            maxUses = link.maxUses,
            maxConcurrentUsers = link.maxConcurrentUsers,
            requireAccount = link.requireAccount ?: false,
            requireNickname = link.requireNickname ?: true,
            requireEmail = link.requireEmail ?: false,
            requireBirthday = link.requireBirthday ?: false,
            allowedLanguages = link.allowedLanguages.orEmpty(),
            allowMessages = link.allowAnonymousMessages ?: true,
            allowImages = link.allowAnonymousImages ?: true,
            allowFiles = link.allowAnonymousFiles ?: false,
            allowHistory = link.allowViewHistory ?: true,
        )

        private fun limitFromInput(raw: String): Int? = raw.filter(Char::isDigit).take(9).toIntOrNull()

        private fun String?.asJson() = if (this == null) JsonNull else JsonPrimitive(this)

        private fun Int?.asJson() = if (this == null) JsonNull else JsonPrimitive(this)
    }
}
