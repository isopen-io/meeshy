package me.meeshy.sdk.model

/**
 * La salle de publication que le lecteur TIENT — une seule à la fois. Miroir de iOS `StoryPostRoomLedger`.
 * Les salles socket sont comptées en références : chaque `join` doit trouver son `leave`. Le registre se souvient
 * de ce qu'il a rejoint, donc quitter c'est quitter CELLE-LÀ, même quand groupe et story changent d'un coup.
 */
data class StoryPostRoomLedger(val held: String? = null) {

    data class Move(val leave: String? = null, val join: String? = null)

    /** Ce qu'il faut quitter et rejoindre pour tenir [postId] (`null` : ne rien tenir), et le registre suivant. */
    fun hold(postId: String?): Pair<StoryPostRoomLedger, Move> =
        if (postId == held) this to Move() else StoryPostRoomLedger(postId) to Move(leave = held, join = postId)
}
