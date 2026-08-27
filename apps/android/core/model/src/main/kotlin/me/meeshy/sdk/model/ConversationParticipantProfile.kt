package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Une capacité d'entrée, nommée — de quoi ranger les refus dans un ordre stable
 * et leur associer un libellé sans manipuler des chaînes.
 *
 * L'ordre de déclaration EST l'ordre d'affichage, et il est le même sur les
 * trois clients : `canViewHistory` en tête parce que c'est le refus qui
 * explique le plus de comportements observables — quelqu'un qui ne réagit
 * jamais à ce qui précède son arrivée ne l'ignore pas, il ne l'a jamais vu.
 *
 * Jumeaux : `ParticipantEntryCapabilities.Capability` (SDK Swift) et
 * `CAPABILITY_ORDER` (`ParticipantProfileCard.tsx`).
 */
enum class ParticipantCapability {
    CAN_VIEW_HISTORY,
    CAN_SEND_MESSAGES,
    CAN_SEND_IMAGES,
    CAN_SEND_FILES,
    CAN_SEND_VIDEOS,
    CAN_SEND_AUDIOS,
    CAN_SEND_LINKS,
    CAN_SEND_LOCATIONS,
}

/**
 * Ce qu'un visiteur entré par lien a le droit de faire — premier cercle de la
 * fiche, servi à tout membre. C'est la résolution EFFECTIVE au moment du join,
 * pas la configuration courante du lien : celle-ci a pu changer depuis, et ne
 * régit plus qui est déjà entré.
 *
 * **Tous les champs ont un défaut.** `kotlinx.serialization` échoue sur le
 * DOCUMENT ENTIER quand un champ requis manque : un modèle plus strict que le
 * fil ne rend pas une fiche incomplète, il ne rend RIEN.
 */
@Serializable
data class ParticipantEntryCapabilities(
    val canSendMessages: Boolean = false,
    val canSendFiles: Boolean = false,
    val canSendImages: Boolean = false,
    val canSendVideos: Boolean = false,
    val canSendAudios: Boolean = false,
    val canSendLocations: Boolean = false,
    val canSendLinks: Boolean = false,
    /**
     * **Nullable, et pas par confort : `null` veut dire « on ne te le dit pas ».**
     * #4009 retire ce droit de la charge diffusée à la room de conversation —
     * « qui a le droit de voir l'historique » est un fait de modération, comme
     * `historyVisibleFrom`. Distinct de `false`, qui le REFUSE : non dit n'est
     * pas refusé.
     */
    val canViewHistory: Boolean? = null,
) {
    /** `null` — la charge ne DIT rien de cette capacité. */
    fun isAllowed(capability: ParticipantCapability): Boolean? = when (capability) {
        ParticipantCapability.CAN_VIEW_HISTORY -> canViewHistory
        ParticipantCapability.CAN_SEND_MESSAGES -> canSendMessages
        ParticipantCapability.CAN_SEND_IMAGES -> canSendImages
        ParticipantCapability.CAN_SEND_FILES -> canSendFiles
        ParticipantCapability.CAN_SEND_VIDEOS -> canSendVideos
        ParticipantCapability.CAN_SEND_AUDIOS -> canSendAudios
        ParticipantCapability.CAN_SEND_LINKS -> canSendLinks
        ParticipantCapability.CAN_SEND_LOCATIONS -> canSendLocations
    }

    /**
     * Ce qui est REFUSÉ, dans l'ordre d'affichage.
     *
     * La règle vit ici plutôt que dans le Composable : énoncer les huit
     * permissions, dont sept accordées, noierait l'unique information utile, et
     * une fiche qui récite des autorisations se lit comme un formulaire. Les
     * trois clients doivent dire la même chose sans réécrire la règle chacun de
     * son côté.
     *
     * `== false`, jamais `!` : une capacité NON DITE ne se range pas parmi les
     * refus (#4009).
     */
    val denied: List<ParticipantCapability>
        get() = ParticipantCapability.entries.filter { isAllowed(it) == false }

    /** Ce que la charge DIT — les seules capacités qu'une édition peut montrer. */
    val disclosed: List<ParticipantCapability>
        get() = ParticipantCapability.entries.filter { isAllowed(it) != null }
}

/**
 * Les réglages du lien emprunté — second cercle, réservé aux hôtes. La salle
 * contient d'autres visiteurs venus par ce même lien, et sa configuration est
 * celle de l'hôte, pas un renseignement sur la personne.
 */
@Serializable
data class ParticipantEntryLink(
    val name: String? = null,
    val isActive: Boolean = false,
    val expiresAt: String? = null,
    val maxUses: Int? = null,
    val currentUses: Int = 0,
    val requireNickname: Boolean = false,
    val requireEmail: Boolean = false,
    val requireBirthday: Boolean = false,
    val allowedCountries: List<String> = emptyList(),
    val allowedLanguages: List<String> = emptyList(),
)

/**
 * La fiche d'un participant — port Android de
 * `GET /conversations/{id}/participants/{participantId}/profile` (#3943).
 *
 * Trois cercles, et le gateway seul décide qui en voit quoi :
 *  - l'identité et `entryCapabilities`, servis à tout membre ;
 *  - `email`, `birthday`, `entryLink` et `historyVisibleFrom`, réservés aux
 *    hôtes — masqués en `null` côté serveur, jamais filtrés ici ;
 *  - `canGrantHistory`, qui répond à « CE lecteur peut-il POSER l'octroi ? ».
 *
 * Ce dernier n'est pas redondant avec `historyVisibleFrom` : celui-ci seul ne
 * distingue pas « pas hôte » de « hôte, aucun octroi posé » — les deux rendent
 * `null`. **Jamais recalculé côté client** : c'est un SIGNAL du serveur, pas
 * une décision.
 *
 * Jumeaux : `ConversationParticipantProfile` (SDK Swift) et `ParticipantProfile`
 * (`apps/web/hooks/queries/use-participant-profile.ts`).
 */
@Serializable
data class ApiParticipantProfile(
    val participantId: String,
    val conversationId: String,
    val isAnonymous: Boolean = false,
    val userId: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val avatar: String? = null,
    val language: String? = null,
    val country: String? = null,
    val conversationRole: String? = null,
    val joinedAt: String? = null,
    val isOnline: Boolean = false,
    val lastActiveAt: String? = null,
    val shareLinkName: String? = null,
    val hasEmail: Boolean = false,
    val hasBirthday: Boolean = false,
    val email: String? = null,
    val birthday: String? = null,
    val entryCapabilities: ParticipantEntryCapabilities? = null,
    val entryLink: ParticipantEntryLink? = null,
    /** Instant ISO 8601 depuis lequel ce participant lit l'historique ; `null` = aucun octroi OU lecteur non-hôte. */
    val historyVisibleFrom: String? = null,
    /** Le lecteur COURANT peut-il poser ou retirer l'octroi ? Réservé aux admin/creator. */
    val canGrantHistory: Boolean = false,
)

/** Corps de `PATCH /conversations/{id}/participants/{participantId}/rights` — l'octroi par DATE. */
@Serializable
data class HistoryGrantUpdate(
    /**
     * `null` explicite RETIRE l'octroi ; la clé ABSENTE ne dirait rien, et le
     * gateway distingue les deux. `@EncodeDefault` n'est donc pas un détail :
     * sans lui, kotlinx OMET la clé pour une valeur nulle et « retirer »
     * deviendrait « ne rien dire » — même piège que l'`encodeIfPresent`
     * synthétisé côté Swift, qui a valu un encodeur manuel à iOS.
     */
    @kotlinx.serialization.EncodeDefault(kotlinx.serialization.EncodeDefault.Mode.ALWAYS)
    val historyVisibleFrom: String? = null,
)
