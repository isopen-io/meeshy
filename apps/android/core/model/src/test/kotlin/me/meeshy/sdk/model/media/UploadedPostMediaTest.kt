package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UploadedPostMediaTest {

    private val hour = 60L * 60 * 1000
    private fun media(key: String, at: Long) = UploadedPostMedia(localKey = key, mediaId = "id-$key", uploadedAtMillis = at)

    @Test
    fun `un id recent est presentable`() {
        assertThat(media("a", 0).isPresentable(2 * hour)).isTrue()
    }

    @Test
    fun `la fenetre est de 24 h moins une marge`() {
        assertThat(UploadedPostMedia.PRESENTATION_WINDOW_MS).isEqualTo(23 * hour)
        assertThat(media("a", 0).isPresentable(23 * hour - 1)).isTrue()
        assertThat(media("a", 0).isPresentable(23 * hour)).isFalse()
        assertThat(media("a", 0).isPresentable(25 * hour)).isFalse()
    }

    @Test
    fun `une horloge reculee n'autorise pas un id`() {
        assertThat(media("a", 10 * hour).isPresentable(hour)).isFalse()
    }

    @Test
    fun `la reprise repart a l'index suivant`() {
        val registry = listOf(media("m1", 0), media("m2", 0))
        val steps = PostMediaResumePlan.plan(listOf("m1", "m2", "m3"), registry, nowMillis = hour)
        assertThat(steps).containsExactly(
            PostMediaStep.Reuse("m1", "id-m1"),
            PostMediaStep.Reuse("m2", "id-m2"),
            PostMediaStep.Upload("m3"),
        ).inOrder()
        assertThat(PostMediaResumePlan.remaining(steps)).containsExactly("m3")
    }

    @Test
    fun `apres 24 h tout est re-televerse depuis le fichier`() {
        val registry = listOf(media("m1", 0), media("m2", 0))
        val steps = PostMediaResumePlan.plan(listOf("m1", "m2"), registry, nowMillis = 25 * hour)
        assertThat(PostMediaResumePlan.remaining(steps)).containsExactly("m1", "m2").inOrder()
    }
}
