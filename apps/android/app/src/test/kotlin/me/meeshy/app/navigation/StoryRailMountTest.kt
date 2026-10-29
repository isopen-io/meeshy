package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #13653 — UN seul rail de stories, monté à deux endroits : en tête du fil et en tête de la liste des
 * conversations. Un troisième câblage de `StoryTray(`, ou l'un des deux écrans qui cesse d'utiliser l'hôte
 * commun, referait la jumelle que la loi « un composant aux deux emplacements » (iOS #11033) a refermée.
 */
class StoryRailMountTest {

    private val appMain = File("src/main/kotlin/me/meeshy/app")
    private val navigation = File(appMain, "navigation")
    private val graph = File(navigation, "graph")

    private fun kotlinSources() = appMain.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

    @Test
    fun `le rail est monte par un seul hote dans toute l application`() {
        val mounting = kotlinSources().filter { Regex("""\bStoryTray\(""").containsMatchIn(it.readText()) }.map { it.name }
        assertThat(mounting).containsExactly("MeeshyStoryRail.kt")
    }

    @Test
    fun `le fil et la liste des conversations montent ce meme hote`() {
        assertThat(File(graph, "FeedNavGraph.kt").readText()).contains("MeeshyStoryRail(")
        assertThat(File(graph, "ConversationsNavGraph.kt").readText()).contains("MeeshyStoryRail(")
    }

    @Test
    fun `tirer la liste des conversations recharge aussi les humeurs du rail, comme iOS`() {
        val graph = File(graph, "ConversationsNavGraph.kt").readText()
        val refresh = graph.substringAfter("onRefresh = ").substringBefore("rowNavigation")
        assertThat(refresh).contains("storiesViewModel.refresh()")
        assertThat(refresh).contains("statusesViewModel.refresh()")
        assertThat(graph).contains("MeeshyStoryRail(navController = navController, storiesViewModel = storiesViewModel, statusesViewModel = statusesViewModel)")
    }

    @Test
    fun `l humeur et l ajout de statut passent par le rail et non par une barre a part`() {
        val host = File(navigation, "MeeshyStoryRail.kt").readText()
        assertThat(host).contains("onAddStatus")
        assertThat(host).contains("onMoodTap")
        assertThat(host).contains("ComposerOrigin.MoodChip")
    }
}
