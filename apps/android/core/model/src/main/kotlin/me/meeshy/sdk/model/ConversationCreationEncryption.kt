package me.meeshy.sdk.model

/**
 * **Le mode de chiffrement d'une conversation se choisit à sa CRÉATION**
 * (directive porteur du 2026-11-01,
 * `packages/shared/decisions/2026-11-01-le-mode-de-chiffrement-se-choisit-a-la-creation.md`).
 *
 * Miroir de `packages/shared/utils/conversation-creation-encryption.ts` (`creationEncryptionOffer`)
 * et d'iOS `ConversationCreationEncryption` — toute évolution touche les TROIS.
 *
 * Le serveur chiffre toujours au repos : « sans chiffrement » n'est pas un choix. Trois modes
 * s'offrent, dans cet ordre :
 * - [CreationEncryptionMode.SERVER] : le choix de tous, et le défaut d'un utilisateur ordinaire ;
 * - [CreationEncryptionMode.HYBRID] : visible pour tous, il chiffre aujourd'hui comme Serveur ;
 * - [CreationEncryptionMode.E2EE] : réservé, pendant la phase de test, au rôle de plateforme qui
 *   peut déjà l'activer (ANALYST et plus, #12588). Il est le défaut de ces rôles LÀ OÙ IL
 *   FONCTIONNE : un tête-à-tête, sur un client qui sait chiffrer. Ailleurs (groupe, client qui ne
 *   lit pas encore le bout en bout) il paraît « bientôt » et le défaut reste Serveur.
 */
enum class CreationEncryptionMode(val wire: String) {
    SERVER("server"),
    HYBRID("hybrid"),
    E2EE("e2ee"),
    ;

    companion object {
        /** Lecture STRICTE du fil (`isCreationEncryptionMode`) : seuls les trois modes, en minuscules. */
        fun fromWire(raw: String?): CreationEncryptionMode? = entries.firstOrNull { it.wire == raw }
    }
}

/** Pourquoi le bout en bout paraît « bientôt » au lieu d'être choisissable. */
enum class CreationEncryptionUnavailability {
    /** Aucun client n'écrit encore dans un groupe chiffré de bout en bout. */
    GROUPS_NOT_YET,

    /** Ce client ne sait pas encore lire ET écrire le bout en bout. */
    CLIENT_NOT_YET,
}

/** Une rangée de l'écran de création : un mode, et s'il se choisit. */
data class CreationEncryptionChoice(
    val mode: CreationEncryptionMode,
    val available: Boolean,
    val unavailability: CreationEncryptionUnavailability?,
)

/** Ce que l'écran de création propose, et ce qu'il présélectionne. */
data class CreationEncryptionOffer(
    val choices: List<CreationEncryptionChoice>,
    val defaultMode: CreationEncryptionMode,
)

object ConversationCreationEncryption {

    /**
     * Le mode d'une création SANS choix : un ancien client, et toute création qui ne passe pas par
     * l'écran de création (profil, partage, transfert, réponse depuis une notification). Jamais le
     * bout en bout d'office : ces chemins portent des pièces jointes qu'il ne scelle pas encore.
     * Ces chemins n'envoient d'ailleurs AUCUN mode : la passerelle pose celui-ci.
     */
    val IMPLICIT_MODE: CreationEncryptionMode = CreationEncryptionMode.SERVER

    val END_TO_END_MINIMUM_PLATFORM_ROLE: PlatformRole = PlatformRole.ANALYST

    /** Le rôle de plateforme qui peut activer — et donc choisir — le bout en bout (`globalRoleLevel`, casse pliée, fermé par défaut). */
    fun mayChooseEndToEnd(platformRole: String?): Boolean =
        PlatformRole.levelOf(platformRole) >= END_TO_END_MINIMUM_PLATFORM_ROLE.level

    /**
     * @param platformRole le `User.role` brut de l'utilisateur qui crée.
     * @param conversationType `direct`, `group`, `public`… tel que la requête le portera.
     * @param endToEndSupported ce client sait-il lire ET écrire le bout en bout ?
     */
    fun offer(platformRole: String?, conversationType: String, endToEndSupported: Boolean): CreationEncryptionOffer {
        val readable = listOf(offered(CreationEncryptionMode.SERVER), offered(CreationEncryptionMode.HYBRID))
        if (!mayChooseEndToEnd(platformRole)) {
            return CreationEncryptionOffer(choices = readable, defaultMode = CreationEncryptionMode.SERVER)
        }
        val unavailability = when {
            conversationType != DIRECT_CONVERSATION_TYPE -> CreationEncryptionUnavailability.GROUPS_NOT_YET
            !endToEndSupported -> CreationEncryptionUnavailability.CLIENT_NOT_YET
            else -> null
        }
        return CreationEncryptionOffer(
            choices = readable + CreationEncryptionChoice(CreationEncryptionMode.E2EE, unavailability == null, unavailability),
            defaultMode = if (unavailability == null) CreationEncryptionMode.E2EE else CreationEncryptionMode.SERVER,
        )
    }

    private fun offered(mode: CreationEncryptionMode) = CreationEncryptionChoice(mode, available = true, unavailability = null)
}
