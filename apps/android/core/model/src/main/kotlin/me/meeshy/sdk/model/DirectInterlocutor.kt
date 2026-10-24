package me.meeshy.sdk.model

// L'interlocuteur d'une conversation directe (#11615, miroir de `DirectInterlocutor.swift`,
// #11164).
//
// Un direct n'a pas de nom propre : il porte celui de l'AUTRE participant, et avec lui son
// identifiant, son pseudo et son avatar (puis sa bannière et son contour, que
// [DirectInterlocutor.participant] donnera à lire dès que le fil les décode). Ces champs
// dérivent d'UNE élection, faite contre l'identifiant du lecteur — ils sont donc vrais
// ensemble ou faux ensemble, jamais à moitié.

/** Type de fil d'un direct, tel que la passerelle le sert et que la création l'envoie. */
const val DIRECT_CONVERSATION_TYPE: String = "direct"

/** Le nom honnête d'un direct dont personne n'a pu être élu. Jamais le `title` stocké. */
const val DIRECT_GENERIC_NAME: String = "Conversation"

private val DIRECT_WIRE_TYPES: Set<String> = setOf(DIRECT_CONVERSATION_TYPE, "dm")

/** Vrai pour les deux types de fil qui désignent une conversation à deux (`direct`, `dm`). */
val ApiConversation.isDirect: Boolean
    get() = type.lowercase() in DIRECT_WIRE_TYPES

/**
 * L'AUTRE participant d'un direct, élu contre le lecteur — le résultat de l'unique élection
 * dont dérivent le nom, l'avatar, le pseudo, la bannière et le contour d'une ligne ou d'un
 * en-tête.
 */
data class DirectInterlocutor(
    val participant: ApiParticipant,
    val userId: String,
) {
    /** Le nom d'affichage : le nom choisi, sinon le pseudo ; `null` si le fil ne sert ni l'un ni l'autre. */
    val name: String?
        get() = participant.displayName?.takeIf { it.isNotBlank() } ?: username

    val username: String?
        get() = participant.username?.takeIf { it.isNotBlank() }

    val avatarUrl: String?
        get() = participant.avatar?.takeIf { it.isNotBlank() }
}

/**
 * L'expéditeur du dernier message d'un direct, quand le fil sait QUI il est : [userId] est un
 * identifiant de COMPTE (jamais de participant), seul comparable à celui du lecteur.
 */
data class DirectLastSender(
    val userId: String?,
    val name: String?,
)

/**
 * L'AUTRE participant, élu contre le LECTEUR [readerId].
 *
 * Un lecteur INCONNU — identifiant absent, vide, session dont le profil n'est pas encore
 * chargé — n'élit personne. « Celui qui n'est pas le lecteur » serait alors le premier
 * participant servi, le plus souvent le lecteur lui-même (le créateur du direct), et la ligne
 * se lirait sous son propre nom et son propre avatar. Un participant sans compte n'est jamais
 * élu : sans identifiant de compte, il n'a ni présence, ni story, ni profil à ouvrir.
 */
fun ApiConversation.interlocutor(readerId: String?): DirectInterlocutor? {
    if (!isDirect || readerId.isNullOrBlank()) return null
    for (participant in participants) {
        val accountId = participant.userId ?: continue
        if (accountId != readerId) return DirectInterlocutor(participant = participant, userId = accountId)
    }
    return null
}

/**
 * L'expéditeur du dernier message, quand le fil permet d'en nommer le COMPTE.
 *
 * `lastMessage.senderId` est un identifiant de PARTICIPANT : seule la table des participants
 * le relie à un compte. Sans elle l'expéditeur reste anonyme ([DirectLastSender.userId]
 * `null`) et ne nomme jamais la ligne — on ne peut pas prouver qu'il n'est pas le lecteur.
 */
fun ApiConversation.lastSenderOrNull(): DirectLastSender? {
    val message = lastMessage ?: return null
    val senderParticipantId = message.senderId?.takeIf { it.isNotBlank() } ?: return null
    val accountId = participants.firstOrNull { it.id == senderParticipantId }?.userId
    return DirectLastSender(userId = accountId, name = message.senderName)
}

/**
 * Le nom d'un direct : l'interlocuteur élu, sinon l'expéditeur du dernier message quand on SAIT
 * qu'il n'est pas le lecteur, sinon un nom générique honnête. Jamais le `title` stocké — un
 * artefact « X et Y » du legacy, qui nomme aussi le lecteur.
 */
fun resolveDirectName(
    interlocutor: DirectInterlocutor?,
    lastSender: DirectLastSender?,
    readerId: String?,
): String {
    interlocutor?.name?.let { return it }
    if (readerId.isNullOrBlank()) return DIRECT_GENERIC_NAME
    val sender = lastSender ?: return DIRECT_GENERIC_NAME
    val senderId = sender.userId?.takeIf { it.isNotBlank() } ?: return DIRECT_GENERIC_NAME
    if (senderId == readerId) return DIRECT_GENERIC_NAME
    return sender.name?.takeIf { it.isNotBlank() } ?: DIRECT_GENERIC_NAME
}

/** Le nom d'un direct pour le lecteur [readerId] — l'élection et son repli en un seul appel. */
fun ApiConversation.directName(readerId: String?): String =
    resolveDirectName(
        interlocutor = interlocutor(readerId),
        lastSender = lastSenderOrNull(),
        readerId = readerId,
    )

/**
 * Vrai quand la ligne nomme au moins DEUX comptes distincts — la condition pour qu'un lecteur
 * quelconque y trouve un interlocuteur. Indépendante du lecteur : c'est ce qui permet au cache,
 * qui ne connaît pas la session, de savoir si une ligne servie a perdu son effectif.
 */
val ApiConversation.namesTwoPeople: Boolean
    get() = participants.mapNotNullTo(HashSet<String>()) { it.userId }.size >= 2

/**
 * Ce que le cache sait de l'interlocuteur, reporté sur une ligne servie qui ne l'a PAS élu
 * (participants non servis, ou un seul). Une ligne qui ne sait rien de lui n'efface pas celle
 * qui sait : sans ce report, la ligne retombait sur le nom générique à chaque synchronisation
 * qui ne servait pas les participants.
 */
fun ApiConversation.keepingParticipantsOf(known: ApiConversation?): ApiConversation {
    if (known == null || !isDirect || namesTwoPeople || !known.namesTwoPeople) return this
    return copy(participants = known.participants)
}

/**
 * La demande de création d'un direct avec [userId] — la SEULE forme que partagent le sélecteur
 * « nouvelle conversation », la réponse à une story ou à une humeur et le bouton Message d'un
 * profil : un direct n'a ni titre ni autre participant que son interlocuteur.
 */
fun directConversationRequest(userId: String): CreateConversationRequest =
    CreateConversationRequest(
        type = DIRECT_CONVERSATION_TYPE,
        title = null,
        participantIds = listOf(userId),
    )

/**
 * La photo d'une ligne de conversation (#12569, miroir d'iOS `isDirect ? participantAvatarURL :
 * avatar` et du web `avatarOf`) : celle du pair en direct, celle de la conversation sinon. Jamais
 * l'une à la place de l'autre : un direct sans photo de pair reste en initiales, il ne prête pas la
 * photo de la conversation (un artefact legacy). Une valeur blanche n'est pas une photo.
 */
fun ApiConversation.displayedAvatar(readerId: String?): String? {
    val served = if (isDirect) interlocutor(readerId)?.avatarUrl else avatar
    return served?.takeIf { it.isNotBlank() }
}
