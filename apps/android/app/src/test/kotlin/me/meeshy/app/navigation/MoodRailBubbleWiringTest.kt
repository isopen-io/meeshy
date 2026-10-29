package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #13662 — l'hôte du rail câble la bulle d'humeur d'iOS : un appui sur l'humeur d'un ami l'ouvre (réagir, republier,
 * répondre), chaque humeur vue compte une impression, la sienne ouvre toujours le composeur d'humeur.
 */
class MoodRailBubbleWiringTest {

    private val host = File("src/main/kotlin/me/meeshy/app/navigation/MeeshyStoryRail.kt").readText()

    @Test
    fun `toucher l humeur d un ami ouvre sa bulle et ouvre la session de lecture`() {
        assertThat(host).contains("MoodBubble(")
        assertThat(host.substringAfter("onMoodTap = ").substringBefore("onMoodShown")).contains("markStatusViewed")
    }

    @Test
    fun `les trois gestes de la bulle sont branches`() {
        assertThat(host).contains("statusesViewModel.react(")
        assertThat(host).contains("StatusComposerDraft.republish(")
        assertThat(host).contains("Routes.moodSpotlight(")
        assertThat(host).contains("statusesViewModel.setStatus(")
    }

    @Test
    fun `chaque apparition d une humeur sur le rail compte une impression, sans dedoublonnage`() {
        assertThat(host).contains("moodIdOf = moods::statusIdOf")
        assertThat(host).contains("onMoodShown = statusesViewModel::trackImpression")
        assertThat(host).doesNotContain("MoodRailImpressions")
        assertThat(host).contains("onDwellEnd = statusesViewModel::endStatusDwell")
    }

    @Test
    fun `une reaction refusee se dit par un toast`() {
        assertThat(host).contains("MoodReactFailureToast(statusesViewModel.reactFailed)")
    }

    @Test
    fun `sa propre humeur ouvre le composeur d humeur, jamais la bulle`() {
        assertThat(host).contains("onAddStatus = { Routes.composer(ComposerOrigin.MoodChip)")
    }
}
