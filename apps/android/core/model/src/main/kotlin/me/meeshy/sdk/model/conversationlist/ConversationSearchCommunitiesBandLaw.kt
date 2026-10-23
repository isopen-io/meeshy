package me.meeshy.sdk.model.conversationlist

/**
 * La bande des communautés suit le focus du champ de recherche (iOS #10841) :
 * elle apparaît au focus, se retire dès qu'il se perd, ne se peint qu'avec des
 * communautés (#10924) et se replie dès le premier caractère (#11036).
 */
object ConversationSearchCommunitiesBandLaw {
    fun isShown(afterFocusChangeTo: Boolean): Boolean = afterFocusChangeTo

    fun drawsBand(communityCount: Int, queryIsEmpty: Boolean): Boolean =
        communityCount > 0 && queryIsEmpty
}
