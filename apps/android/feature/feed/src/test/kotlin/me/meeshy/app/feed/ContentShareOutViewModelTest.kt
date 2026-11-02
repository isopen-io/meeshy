package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.PostShareLinkLaw
import me.meeshy.sdk.model.PostShareTarget
import me.meeshy.sdk.model.share.ShareCards
import me.meeshy.sdk.post.PostShareLinkService
import org.junit.After
import org.junit.Before
import org.junit.Test

/** #14315 — « Partager » emporte le lien suivi de l'utilisateur vers la feuille du système, sinon l'adresse directe. */
@OptIn(ExperimentalCoroutinesApi::class)
class ContentShareOutViewModelTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val story = ShareCards.story("s1", authorId = "a1", messageText = "Story de Léa : ${ShareCards.storyUrl("s1")}", isPublic = true)

    @Test
    fun `sharing out a story mints the system link and carries it in the sentence`() {
        val links = mockk<PostShareLinkService>()
        coEvery { links.resolve("s1", "system") } returns PostShareTarget("https://meeshy.me/l/tok", tracked = true)
        val opened = mutableListOf<String>()

        ContentShareOutViewModel(links).shareOut(story) { opened += it }

        assertThat(opened).containsExactly("Story de Léa : https://meeshy.me/l/tok")
        coVerify(exactly = 1) { links.resolve("s1", "system") }
    }

    @Test
    fun `without a minted link the story keeps its own address, never the post fallback`() {
        val links = mockk<PostShareLinkService>()
        coEvery { links.resolve(any(), any()) } returns PostShareLinkLaw.resolve("s1", null)
        val opened = mutableListOf<String>()

        ContentShareOutViewModel(links).shareOut(story) { opened += it }

        assertThat(opened).containsExactly("Story de Léa : ${ShareCards.storyUrl("s1")}")
    }

    @Test
    fun `a friends story leaves at once with its own address, never a link that opens without an account`() {
        val links = mockk<PostShareLinkService>()
        val opened = mutableListOf<String>()

        ContentShareOutViewModel(links).shareOut(story.copy(isPublicStory = false)) { opened += it }

        assertThat(opened).containsExactly("Story de Léa : ${ShareCards.storyUrl("s1")}")
        coVerify(exactly = 0) { links.resolve(any(), any()) }
    }

    @Test
    fun `a profile card leaves at once, without minting`() {
        val links = mockk<PostShareLinkService>()
        val opened = mutableListOf<String>()

        ContentShareOutViewModel(links).shareOut(ShareCards.profile("u1", "Léa", "https://meeshy.me/u/lea", "Profil de Léa")) { opened += it }

        assertThat(opened).containsExactly("Profil de Léa")
        coVerify(exactly = 0) { links.resolve(any(), any()) }
    }
}
