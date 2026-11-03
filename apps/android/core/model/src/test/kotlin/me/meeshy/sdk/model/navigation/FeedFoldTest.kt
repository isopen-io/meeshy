package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedFoldTest {
    private val shown = FeedFold(feedShown = true)

    @Test
    fun `une pile non vide replie le flux et s'en souvient`() {
        val folded = shown.onStackChanged(stackIsEmpty = false)

        assertThat(folded).isEqualTo(FeedFold(feedShown = false, wasShownBeforeNavigation = true))
    }

    @Test
    fun `le retour a la pile vide remontre le flux une seule fois`() {
        val back = shown.onStackChanged(false).onStackChanged(true)

        assertThat(back).isEqualTo(FeedFold(feedShown = true, wasShownBeforeNavigation = false))
        assertThat(back.onStackChanged(true)).isEqualTo(back)
    }

    @Test
    fun `un flux jamais ouvert n'est pas rouvert par un retour`() {
        val closed = FeedFold()

        assertThat(closed.onStackChanged(false).onStackChanged(true)).isEqualTo(closed)
    }

    @Test
    fun `un second changement de pile non vide ne perd pas le souvenir`() {
        val deeper = shown.onStackChanged(false).onStackChanged(false)

        assertThat(deeper.wasShownBeforeNavigation).isTrue()
        assertThat(deeper.onStackChanged(true).feedShown).isTrue()
    }

    @Test
    fun `l'acces rapide au composeur montre le flux`() {
        assertThat(FeedFold().onFeedComposerRequested().feedShown).isTrue()
        assertThat(shown.onFeedComposerRequested()).isEqualTo(shown)
    }

    @Test
    fun `basculer le flux oublie le souvenir de navigation`() {
        val toggled = shown.onStackChanged(false).onFeedToggled()

        assertThat(toggled).isEqualTo(FeedFold(feedShown = true, wasShownBeforeNavigation = false))
    }

    @Test
    fun `le ressort est celui d'iOS`() {
        assertThat(FeedFold.SPRING_RESPONSE_SECONDS).isEqualTo(0.3f)
        assertThat(FeedFold.SPRING_DAMPING_FRACTION).isEqualTo(0.8f)
    }
}
