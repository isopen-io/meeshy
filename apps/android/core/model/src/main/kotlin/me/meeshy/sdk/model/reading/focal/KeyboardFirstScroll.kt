package me.meeshy.sdk.model.reading.focal

/** Le défilement vers les anciens messages ferme d'abord le clavier; le chrome attend. */
object KeyboardFirstScroll {

    fun dismissesKeyboard(keyboardOpen: Boolean, towardOlder: Boolean): Boolean =
        keyboardOpen && towardOlder

    fun chromeMayCollapse(keyboardOpenAtGestureStart: Boolean, keyboardOpen: Boolean): Boolean =
        !keyboardOpenAtGestureStart && !keyboardOpen
}
