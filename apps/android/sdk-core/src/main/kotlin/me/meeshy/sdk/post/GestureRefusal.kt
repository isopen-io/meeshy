package me.meeshy.sdk.post

/** Les deux gestes optimistes du fil que la file d'envoi peut perdre définitivement. */
enum class PostGesture { LIKE, BOOKMARK }

/**
 * Le refus définitif d'un geste du fil : [reason] est la raison que la file a gardée (porte le code de la passerelle, par
 * exemple `DAILY_REACTION_LIMIT`), ou `null` quand elle n'en dit aucune.
 */
data class GestureRefusal(val postId: String, val gesture: PostGesture, val reason: String?)
