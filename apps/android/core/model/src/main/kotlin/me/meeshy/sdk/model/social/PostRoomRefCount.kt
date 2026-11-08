package me.meeshy.sdk.model.social

/**
 * Les salles de post tenues par la socket, COMPTÉES PAR RÉFÉRENCE (miroir de `joinedPostRooms: [String: Int]`, iOS) :
 * n écrans sur le même post ne quittent la salle qu'à la dernière sortie. Valeur immuable ; chaque transition rend
 * le nouvel état et dit s'il faut émettre `post:join` / `post:leave`.
 */
data class PostRoomRefCount(private val holders: Map<String, Int> = emptyMap()) {

    data class Step(val next: PostRoomRefCount, val emit: Boolean)

    /** Émettre seulement à la PREMIÈRE prise : le serveur a déjà la salle quand un autre écran la tient. */
    fun join(postId: String): Step =
        Step(PostRoomRefCount(holders + (postId to (holders[postId] ?: 0) + 1)), emit = (holders[postId] ?: 0) == 0)

    /** Émettre seulement à la DERNIÈRE sortie ; une sortie sans prise préalable est inerte. */
    fun leave(postId: String): Step {
        val count = holders[postId] ?: return Step(this, emit = false)
        return if (count <= 1) Step(PostRoomRefCount(holders - postId), emit = true)
        else Step(PostRoomRefCount(holders + (postId to count - 1)), emit = false)
    }

    fun holdersOf(postId: String): Int = holders[postId] ?: 0

    /** Les salles à rejoindre à chaque (re)connexion, dans un ordre déterministe. */
    fun toRejoin(): List<String> = holders.keys.sorted()
}
