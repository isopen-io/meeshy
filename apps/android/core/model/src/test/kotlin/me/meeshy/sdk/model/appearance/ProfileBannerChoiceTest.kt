package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ProfileDecorRef
import org.junit.Test

class ProfileBannerChoiceTest {

    private val design = ProfileDecorRef("bannieres-essentielles", "aurore")

    @Test
    fun `a banner photo shows on the Image tile and hides every design`() {
        val choice = ProfileBannerChoice(photo = "https://cdn/p.jpg", design = design)

        assertThat(choice.imagePreview).isEqualTo("https://cdn/p.jpg")
        assertThat(choice.imageSelected).isTrue()
        assertThat(choice.photoHidesDesigns).isTrue()
        assertThat(choice.isSelected(design)).isFalse()
    }

    @Test
    fun `without a photo the equipped design is the selected tile`() {
        val choice = ProfileBannerChoice(photo = null, design = design)

        assertThat(choice.imagePreview).isNull()
        assertThat(choice.imageSelected).isFalse()
        assertThat(choice.photoHidesDesigns).isFalse()
        assertThat(choice.isSelected(design)).isTrue()
        assertThat(choice.isSelected(ProfileDecorRef("bannieres-essentielles", "autre"))).isFalse()
    }

    @Test
    fun `with neither photo nor design the Image tile is the selected one`() {
        val choice = ProfileBannerChoice(photo = "", design = null)

        assertThat(choice.imageSelected).isTrue()
        assertThat(choice.imagePreview).isNull()
        assertThat(choice.photoHidesDesigns).isFalse()
    }
}
