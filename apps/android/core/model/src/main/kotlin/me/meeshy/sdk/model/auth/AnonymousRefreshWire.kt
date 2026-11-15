package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.AnonymousParticipant
import me.meeshy.sdk.model.JoinedConversation

/**
 * Corps de `POST /anonymous/refresh` : le jeton de la session d'invité, celui que
 * `POST /anonymous/join/{linkId}` a rendu. La route ne connaît QUE la session
 * d'invité — elle ne lit ni le JWT ni le compte inscrit.
 */
@Serializable
data class AnonymousRefreshRequest(val sessionToken: String)

/**
 * `data` de `POST /anonymous/refresh` : le participant et la conversation tels que
 * la passerelle les voit MAINTENANT (droits d'écriture, historique), la session
 * étant maintenue active. Deux champs absents se lisent absents : un invité dont
 * la charge est illisible garde sa session, il ne la perd pas.
 */
@Serializable
data class AnonymousRefreshData(
    val participant: AnonymousParticipant? = null,
    val conversation: JoinedConversation? = null,
)
