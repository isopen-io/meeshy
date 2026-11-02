package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedPrefetchWindowTest {
    @Test
    fun `la fenetre couvre deux rangees avant et sept apres, borne haute exclue`() {
        assertThat(FeedPrefetchWindow.window(index = 10, count = 50).toList()).containsExactlyElementsIn(8..16).inOrder()
    }

    @Test
    fun `en tete de fil la borne basse reste a zero`() {
        assertThat(FeedPrefetchWindow.window(index = 0, count = 50).toList()).containsExactlyElementsIn(0..6).inOrder()
    }

    @Test
    fun `en fin de fil la borne haute est la taille`() {
        assertThat(FeedPrefetchWindow.window(index = 48, count = 50).toList()).containsExactlyElementsIn(46..49).inOrder()
    }

    @Test
    fun `un fil raccourci entre-temps ne rend jamais de bornes inversees`() {
        assertThat(FeedPrefetchWindow.window(index = 30, count = 5).toList()).isEmpty()
        assertThat(FeedPrefetchWindow.window(index = 3, count = 0).toList()).isEmpty()
    }

    @Test
    fun `un deplacement de moins de deux rangees ne declenche rien`() {
        assertThat(FeedPrefetchWindow.shouldTrigger(index = 5, lastIndex = 5)).isFalse()
        assertThat(FeedPrefetchWindow.shouldTrigger(index = 6, lastIndex = 5)).isFalse()
        assertThat(FeedPrefetchWindow.shouldTrigger(index = 4, lastIndex = 5)).isFalse()
    }

    @Test
    fun `un deplacement de deux rangees ou plus declenche, dans les deux sens`() {
        assertThat(FeedPrefetchWindow.shouldTrigger(index = 7, lastIndex = 5)).isTrue()
        assertThat(FeedPrefetchWindow.shouldTrigger(index = 3, lastIndex = 5)).isTrue()
    }

    @Test
    fun `contre l indice initial, la rangee zero attend la suivante comme sur iOS`() {
        assertThat(FeedPrefetchWindow.shouldTrigger(index = 0, lastIndex = FeedPrefetchWindow.NO_PREVIOUS_INDEX)).isFalse()
        assertThat(FeedPrefetchWindow.shouldTrigger(index = 1, lastIndex = FeedPrefetchWindow.NO_PREVIOUS_INDEX)).isTrue()
    }

    @Test
    fun `l'anti-rebond est de 150 ms`() {
        assertThat(FeedPrefetchWindow.DEBOUNCE_MS).isEqualTo(150L)
    }
}
