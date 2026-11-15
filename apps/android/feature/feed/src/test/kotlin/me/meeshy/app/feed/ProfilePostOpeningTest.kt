package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfilePostOpeningTest {

    private class Recorder {
        val log = mutableListOf<String>()
    }

    private fun TestScope.opening(rec: Recorder, withReels: Boolean = true) = ProfilePostOpening(
        scope = this,
        reportOpen = { rec.log += "open:$it" },
        openPost = { rec.log += "post:$it" },
        dismiss = { rec.log += "dismiss" },
        openReels = if (withReels) ({ id, ids -> rec.log += "reels:$id:${ids.joinToString(",")}" }) else null,
        haptic = { rec.log += "haptic" },
    )

    @Test
    fun `chaque toucher d'un post envoie l'engagement puis ouvre le detail`() = runTest {
        val rec = Recorder()
        val opening = opening(rec)
        opening.post("p1")
        opening.post("p1")
        assertThat(rec.log).containsExactly("open:p1", "post:p1", "open:p1", "post:p1").inOrder()
    }

    @Test
    fun `un reel ferme la fiche attend 350 ms puis ouvre le lecteur avec la liste en graine`() = runTest {
        val rec = Recorder()
        opening(rec).reel("r2", listOf("r1", "r2", "r3"))
        runCurrent()
        assertThat(rec.log).containsExactly("open:r2", "dismiss").inOrder()
        advanceTimeBy(349)
        runCurrent()
        assertThat(rec.log).doesNotContain("haptic")
        advanceTimeBy(1)
        runCurrent()
        assertThat(rec.log).containsExactly("open:r2", "dismiss", "haptic", "reels:r2:r1,r2,r3").inOrder()
    }

    @Test
    fun `sans hote de reels le reel retombe sur le detail du post`() = runTest {
        val rec = Recorder()
        opening(rec, withReels = false).reel("r2", listOf("r2"))
        runCurrent()
        assertThat(rec.log).containsExactly("open:r2", "post:r2").inOrder()
    }

    @Test
    fun `rouvrir le meme reel renvoie l'engagement`() = runTest {
        val rec = Recorder()
        val opening = opening(rec)
        opening.reel("r1", listOf("r1"))
        opening.reel("r1", listOf("r1"))
        runCurrent()
        assertThat(rec.log.count { it == "open:r1" }).isEqualTo(2)
    }
}
