package me.meeshy.sdk.model

import me.meeshy.sdk.model.profile.ProfileSheetUser

/**
 * Loi de présentation de l'avis d'arrivée « X a rejoint la conversation » — miroir de
 * `JoinNoticePresentation` (iOS). Décidable hors de Compose.
 *
 * Le nom DONNÉ au formulaire prime. Le pseudo d'un participant SANS COMPTE n'est jamais
 * affiché en @handle : `ano_…` est un identifiant technique, et la pastille « sans compte »
 * dit déjà qui il est. La décision lit [JoinNoticeMetadata.isAnonymous], jamais le préfixe —
 * un compte nommé `ano_bob` garde son @handle. Un handle identique au nom principal disparaît.
 */
data class JoinNoticePresentation(
    val primaryName: String,
    val handle: String?,
    val showsNoAccountBadge: Boolean,
    val rules: JoinNoticeMetadata.LinkRules?,
    /** Le participant dont la fiche s'ouvre au double toucher ; vide ⇒ aucune fiche. */
    val participantId: String = "",
    /** Le pseudo que « dis-lui salut » écrit dans le composeur (#16338) ; null : personne à saluer ([ArrivalGreeting.handleOf]). */
    val greetHandle: String? = null,
) {
    /** Le glyphe de tête : masques pour un visiteur sans compte, personne+ sinon (iOS `theatermasks.fill` / `person.badge.plus`). */
    enum class Glyph { PersonPlus, Masks }

    val glyph: Glyph get() = if (showsNoAccountBadge) Glyph.Masks else Glyph.PersonPlus

    val opensProfile: Boolean get() = participantId.isNotEmpty()

    /** Une seconde ligne (@handle et/ou règles d'entrée) ⇒ la pastille s'arrondit moins (iOS `hasDetailRow`). */
    val hasDetailRow: Boolean get() = handle != null || rules != null

    /**
     * L'identité que le double toucher remet à la fiche : seul `Participant.id` est connu de l'avis, donc
     * la route est celle de la PARTICIPATION de la conversation, jamais d'un compte (même convention que
     * `ProfileSheetUser.from(member)` sans `userId`).
     */
    fun toProfileSheetUser(): ProfileSheetUser = ProfileSheetUser(
        username = primaryName,
        displayName = primaryName,
        participantId = participantId.takeIf { it.isNotEmpty() },
        isAnonymous = true,
    )

    companion object {
        fun of(notice: JoinNoticeMetadata, isOwn: Boolean = false): JoinNoticePresentation {
            val primary = notice.givenName?.takeIf { it.isNotEmpty() } ?: notice.displayName
            val username = notice.username?.takeIf { it.isNotEmpty() && !notice.isAnonymous }
            return JoinNoticePresentation(
                primaryName = primary,
                handle = username?.takeIf { it != primary }?.let { "@$it" },
                showsNoAccountBadge = notice.isAnonymous,
                rules = notice.linkRules,
                participantId = notice.participantId,
                greetHandle = ArrivalGreeting.handleOf(notice, isOwn),
            )
        }
    }
}
