package me.meeshy.sdk.model

import java.util.Locale

/**
 * **Qui peut RETIRER le contenu d'un autre** (#11151) — miroir de `ContentRemovalPolicy.swift`.
 * La passerelle tranche ; ce prédicat décide seulement si « Retirer » s'offre.
 *
 * - Un MESSAGE : son verdict est [MessageActionPolicy.Verdicts.remove] — la loi des actions, seule
 *   source (jamais en direct, un tiers privilégié de la conversation ou la modération de la
 *   plateforme, motif exigé). Aucune seconde règle ici.
 * - Une PUBLICATION (post, réel, story) ou un commentaire : la modération de la plateforme
 *   seulement, jamais sur son propre contenu — son propre contenu se SUPPRIME.
 *
 * Le motif part normalisé par [ContentRemovalReason].
 */
object ContentRemovalPolicy {

    /** Les types de conversation où un message se retire — `MODERATED_TYPES` de la loi des actions. */
    val MESSAGE_REMOVAL_CONVERSATION_TYPES: Set<String> = setOf("group", "public", "global", "broadcast")

    private val PLATFORM_MODERATOR_ROLES: Set<String> = setOf("MODERATOR", "ADMIN", "BIGBOSS")

    /** La modération de la plateforme, casse pliée comme `ContentRemovalPolicy.isPlatformModerator` (iOS). */
    fun isPlatformModerator(platformRole: String?): Boolean =
        (platformRole ?: "").uppercase(Locale.ROOT) in PLATFORM_MODERATOR_ROLES

    fun mayRemovePublication(authoredByViewer: Boolean, platformRole: String?): Boolean =
        !authoredByViewer && isPlatformModerator(platformRole)

    /** Le verdict « Retirer » d'un message, lu dans la loi des actions. */
    fun mayRemoveMessage(input: MessageActionPolicy.Input): Boolean =
        MessageActionPolicy.actionsFor(input).verdicts.remove != null
}
