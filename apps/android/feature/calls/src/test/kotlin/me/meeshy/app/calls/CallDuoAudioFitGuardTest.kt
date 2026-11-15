package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #18488 — la colonne connectée applique la loi `CallDuoAudioFit` : à hauteur compacte, un duo audio resserre ses marges,
 * passe l'avatar en forme compacte et donne sa liste au journal ; rien de cela ne touche la vidéo ni le groupe.
 */
class CallDuoAudioFitGuardTest {
    private fun layout(): String = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls/CallConnectedLayout.kt") }
        .first { it.isFile }
        .readText()

    @Test
    fun `la colonne connectee ne resserre que le duo audio, par les marges et la liste de la loi`() {
        val layout = layout()
        assertThat(layout).contains("val compactAudio = groupStage == null && CallHeaderLaw.centersPeerBlock(videoStage) && isCompactHeight")
        assertThat(layout).contains("bottom = CallDuoAudioFit.columnBottomDp(compactAudio).dp")
        assertThat(layout).contains("bottomPadding = CallDuoAudioFit.blockBottomDp(compactAudio).dp")
        assertThat(layout).contains("journalListDp = if (compactAudio) CallDuoAudioFit.journalListDp(stageMaxHeight.value) else null")
        assertThat(layout).contains("isCompactHeight = isCompactHeight, controlsShown = controlsVisible")
        assertThat(layout).contains("stageHeightDp = stageMaxHeight.value")
    }
}
