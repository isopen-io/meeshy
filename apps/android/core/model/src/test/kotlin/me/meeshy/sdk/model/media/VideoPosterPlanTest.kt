package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.VideoPosterPlan.Intent
import me.meeshy.sdk.model.media.VideoPosterPlan.Step
import org.junit.Test

class VideoPosterPlanTest {
    private fun steps(
        local: String? = null,
        remote: String? = "https://m.meeshy.me/v.mp4",
        policy: Boolean = false,
        network: Boolean = true,
        intent: Intent = Intent.USER_OPENED,
    ) = VideoPosterPlan.steps(local, remote, policy, network, intent)

    @Test fun `le fichier local gagne toujours meme hors ligne`() {
        assertThat(steps(local = "/data/v.mp4", network = false, intent = Intent.AMBIENT_PREWARM))
            .containsExactly(Step.DecodeLocalFile("/data/v.mp4"))
    }

    @Test fun `politique permissive attend le fichier puis extrait en dernier recours`() {
        assertThat(steps(policy = true)).containsExactly(
            Step.DownloadThenDecode("https://m.meeshy.me/v.mp4"), Step.RangeExtract("https://m.meeshy.me/v.mp4"),
        ).inOrder()
    }

    @Test fun `politique restrictive un geste paie le premier Mo`() {
        assertThat(steps(policy = false, intent = Intent.USER_OPENED))
            .containsExactly(Step.RangeExtract("https://m.meeshy.me/v.mp4"))
    }

    @Test fun `politique restrictive un prechauffage ne touche pas le reseau`() {
        assertThat(steps(policy = false, intent = Intent.AMBIENT_PREWARM)).isEmpty()
    }

    @Test fun `sans reseau rien n'est extrait`() {
        assertThat(steps(policy = true, network = false)).isEmpty()
    }

    @Test fun `sans url distante ou avec une url de fichier rien`() {
        assertThat(steps(remote = null)).isEmpty()
        assertThat(steps(remote = "")).isEmpty()
        assertThat(steps(remote = "file:///x.mp4", policy = true)).isEmpty()
    }

    @Test fun `un prechauffage autorise par la politique telecharge`() {
        assertThat(steps(policy = true, intent = Intent.AMBIENT_PREWARM)).hasSize(2)
    }
}
