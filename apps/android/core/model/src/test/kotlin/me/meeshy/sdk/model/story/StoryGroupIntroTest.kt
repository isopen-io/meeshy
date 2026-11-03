package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

class StoryGroupIntroTest {
    private fun user(
        username: String = "ada",
        displayName: String? = null,
        firstName: String? = null,
        lastName: String? = null,
        banner: String? = null,
    ) = MeeshyUser(id = "u1", username = username, displayName = displayName, firstName = firstName, lastName = lastName, banner = banner, bannerThumbHash = "hash")

    @Test
    fun `le substitut porte le nom servi avec la story et aucune ligne arobase`() {
        val intro = StoryGroupIntro.placeholder("u1", "Ada L.")
        assertThat(intro.title).isEqualTo("Ada L.")
        assertThat(intro.handle).isNull()
    }

    @Test
    fun `le profil resolu pose le vrai pseudo apres l arobase`() {
        val intro = StoryGroupIntro.placeholder("u1", "Ada L.").withProfile(user(displayName = "Ada Lovelace"))
        assertThat(intro.title).isEqualTo("Ada Lovelace")
        assertThat(intro.handle).isEqualTo("@ada")
    }

    @Test
    fun `sans nom d affichage on compose prenom et nom`() {
        val intro = StoryGroupIntro.placeholder("u1", "x").withProfile(user(firstName = " Ada ", lastName = "Lovelace"))
        assertThat(intro.title).isEqualTo("Ada Lovelace")
    }

    @Test
    fun `sans aucun nom le pseudo sert de titre et la ligne arobase disparait`() {
        val intro = StoryGroupIntro.placeholder("u1", "x").withProfile(user())
        assertThat(intro.title).isEqualTo("ada")
        assertThat(intro.handle).isNull()
    }

    @Test
    fun `la banniere et son thumbhash viennent du profil`() {
        val intro = StoryGroupIntro.placeholder("u1", "x").withProfile(user(banner = "https://b"))
        assertThat(intro.bannerUrl).isEqualTo("https://b")
        assertThat(intro.bannerThumbHash).isEqualTo("hash")
    }

    @Test
    fun `une identite sans nom ni banniere reste a enrichir`() {
        assertThat(StoryGroupIntro.placeholder("u1", "x").needsProfile).isTrue()
        assertThat(StoryGroupIntro.placeholder("u1", "x").withProfile(user(displayName = "A")).needsProfile).isFalse()
    }

    @Test
    fun `le resume vocal enchaine nom, presence et humeur`() {
        val intro = StoryGroupIntro.placeholder("u1", "Ada").copy(moodEmoji = "😀", moodMessage = "Au calme")
        assertThat(intro.summary(presenceLabel = "En ligne")).isEqualTo("Ada, En ligne, Au calme")
        assertThat(intro.summary(presenceLabel = null)).isEqualTo("Ada, Au calme")
    }

    @Test
    fun `le voile de lisibilite garde les trois paliers d iOS`() {
        assertThat(StoryGroupIntro.SCRIM_ALPHAS).containsExactly(0.62f, 0.28f, 0.72f).inOrder()
    }
}
