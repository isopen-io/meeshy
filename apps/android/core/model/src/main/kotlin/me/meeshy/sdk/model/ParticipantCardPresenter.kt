package me.meeshy.sdk.model

/** Une ligne d'information de la fiche, dans l'ordre où l'œil la cherche. */
enum class ParticipantInfoKind { LANGUAGE, COUNTRY, JOINED, VIA_LINK, EMAIL, BIRTHDAY }

/**
 * [value] est la valeur BRUTE (une date reste ISO 8601, formatée par l'écran dans la locale de l'appareil).
 * [withheld] : la coordonnée existe (`hasEmail` / `hasBirthday`) mais le serveur ne la sert pas à ce lecteur — l'écran
 * dit « fourni, réservé aux modérateurs » au lieu d'une valeur.
 */
data class ParticipantInfoRow(
    val kind: ParticipantInfoKind,
    val value: String?,
    val withheld: Boolean = false,
)

enum class EntryLinkRequirement { NICKNAME, EMAIL, BIRTHDAY }

/** Les réglages du lien emprunté, prêts à peindre — second cercle, servi aux seuls hôtes. */
data class EntryLinkSettings(
    val inactive: Boolean,
    /** « n / max », ou « n » sans plafond. */
    val uses: String,
    val expiresAt: String?,
    val requirements: List<EntryLinkRequirement>,
    /** Langues admises en majuscules, `null` quand le lien n'en restreint aucune. */
    val languages: String?,
)

/**
 * Ce que la fiche d'un participant DIT — la règle d'affichage vit ici, pas dans le Composable, pour que les trois
 * clients disent la même chose. Aucune autorisation n'est recalculée : le gateway sert ce que le lecteur a le droit de
 * voir, et la PRÉSENCE de `entryLink` est sa réponse à « ce lecteur peut-il écrire ».
 *
 * Jumeau : `ParticipantProfileSheet.swift` (`content`, `entryLinkSection`, `resolvedFullName`).
 */
object ParticipantCardPresenter {
    const val REQUIREMENT_SEPARATOR = " · "

    /** Prénom + nom, à défaut le nom affiché, à défaut le pseudo. */
    fun fullName(profile: ApiParticipantProfile): String {
        val full = listOfNotNull(profile.firstName, profile.lastName)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(" ")
        return full.ifEmpty { profile.displayName ?: profile.username ?: "" }
    }

    fun infoRows(profile: ApiParticipantProfile): List<ParticipantInfoRow> = listOfNotNull(
        profile.language.present()?.let { ParticipantInfoRow(ParticipantInfoKind.LANGUAGE, it.uppercase()) },
        profile.country.present()?.let { ParticipantInfoRow(ParticipantInfoKind.COUNTRY, it) },
        profile.joinedAt.present()?.let { ParticipantInfoRow(ParticipantInfoKind.JOINED, it) },
        profile.shareLinkName.present()?.let { ParticipantInfoRow(ParticipantInfoKind.VIA_LINK, it) },
        profile.takeIf { it.hasEmail }?.let { coordinate(ParticipantInfoKind.EMAIL, it.email) },
        profile.takeIf { it.hasBirthday }?.let { coordinate(ParticipantInfoKind.BIRTHDAY, it.birthday) },
    )

    /** Les droits sont éditables quand le serveur a servi `entryLink` — jamais déduit d'un rang. */
    fun canEditRights(profile: ApiParticipantProfile): Boolean = profile.entryLink != null

    /** Les interrupteurs : les droits que la charge DIT (un droit non dit mentirait dans les deux positions). */
    fun editableCapabilities(profile: ApiParticipantProfile): List<ParticipantCapability> =
        profile.entryCapabilities?.disclosed.orEmpty()

    fun linkSettings(link: ParticipantEntryLink): EntryLinkSettings = EntryLinkSettings(
        inactive = !link.isActive,
        uses = link.maxUses?.let { "${link.currentUses} / $it" } ?: "${link.currentUses}",
        expiresAt = link.expiresAt.present(),
        requirements = listOfNotNull(
            EntryLinkRequirement.NICKNAME.takeIf { link.requireNickname },
            EntryLinkRequirement.EMAIL.takeIf { link.requireEmail },
            EntryLinkRequirement.BIRTHDAY.takeIf { link.requireBirthday },
        ),
        languages = link.allowedLanguages.takeIf { it.isNotEmpty() }?.joinToString(", ")?.uppercase(),
    )

    /** « pseudo · email » — les exigences se lisent ensemble, une ligne par exigence ferait un formulaire. */
    fun joinRequirements(labels: List<String>): String = labels.joinToString(REQUIREMENT_SEPARATOR)

    private fun coordinate(kind: ParticipantInfoKind, value: String?): ParticipantInfoRow {
        val served = value.present()
        return ParticipantInfoRow(kind, served, withheld = served == null)
    }

    private fun String?.present(): String? = this?.takeIf { it.isNotBlank() }
}
