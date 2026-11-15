package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class KeyboardFirstScrollTest {

    @Test
    fun `défiler vers les anciens avec le clavier ouvert ferme d'abord le clavier`() {
        assertThat(KeyboardFirstScroll.dismissesKeyboard(keyboardOpen = true, towardOlder = true)).isTrue()
    }

    @Test
    fun `sans clavier ou vers les récents le clavier n'est pas touché`() {
        assertThat(KeyboardFirstScroll.dismissesKeyboard(keyboardOpen = false, towardOlder = true)).isFalse()
        assertThat(KeyboardFirstScroll.dismissesKeyboard(keyboardOpen = true, towardOlder = false)).isFalse()
    }

    @Test
    fun `le chrome ne se replie pas si le clavier était ouvert au début du geste`() {
        assertThat(KeyboardFirstScroll.chromeMayCollapse(keyboardOpenAtGestureStart = true, keyboardOpen = false))
            .isFalse()
        assertThat(KeyboardFirstScroll.chromeMayCollapse(keyboardOpenAtGestureStart = false, keyboardOpen = true))
            .isFalse()
        assertThat(KeyboardFirstScroll.chromeMayCollapse(keyboardOpenAtGestureStart = false, keyboardOpen = false))
            .isTrue()
    }
}
