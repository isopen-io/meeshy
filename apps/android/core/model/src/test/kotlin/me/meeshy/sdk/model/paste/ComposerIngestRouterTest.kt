package me.meeshy.sdk.model.paste

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerIngestRouterTest {
    @Test
    fun `chaque famille a sa porte et la casse ne compte pas`() {
        assertThat(ComposerIngestRouter.route("IMAGE/PNG")).isEqualTo(PastedPipeline.IMAGE)
        assertThat(ComposerIngestRouter.route(" video/mp4 ")).isEqualTo(PastedPipeline.VIDEO)
        assertThat(ComposerIngestRouter.route("Audio/Ogg")).isEqualTo(PastedPipeline.AUDIO)
    }

    @Test
    fun `un MIME vide ou octet-stream est un fichier`() {
        assertThat(ComposerIngestRouter.route("")).isEqualTo(PastedPipeline.FILE)
        assertThat(ComposerIngestRouter.route(null)).isEqualTo(PastedPipeline.FILE)
        assertThat(ComposerIngestRouter.route("Application/Octet-Stream")).isEqualTo(PastedPipeline.FILE)
        assertThat(ComposerIngestRouter.route("application/pdf")).isEqualTo(PastedPipeline.FILE)
    }
}
