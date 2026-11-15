package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Les routes du lecteur de stories sortent de `FeedNavGraph` vers `StoryNavGraph` sans changer d'adresse :
 * `Routes.story` et le lien `meeshy://story/{userId}` restent ceux que les notifications et les partages connaissent.
 */
class StoryRoutesTest {

    private val graphDir = File("src/main/kotlin/me/meeshy/app/navigation/graph")

    @Test
    fun `Routes story et le lien profond restent inchanges`() {
        assertThat(Routes.story("u1")).isEqualTo("story/u1")
        assertThat(Routes.story("u1", storyId = "s 1")).isEqualTo("story/u1?storyId=s%201")
        assertThat(Routes.STORY_DEEP_LINK).isEqualTo("meeshy://story/{userId}")
        assertThat(Routes.STORY_VIEWER).isEqualTo("story/{userId}?storyId={storyId}")
    }

    @Test
    fun `la destination du lecteur vit dans StoryNavGraph et nulle part ailleurs`() {
        val declaring = graphDir.listFiles { file -> file.name.endsWith(".kt") }.orEmpty()
            .filter { Regex("""composable\(\s*route = Routes\.STORY_VIEWER""").containsMatchIn(it.readText()) }
            .map { it.name }

        assertThat(declaring).containsExactly("StoryNavGraph.kt")
    }
}
