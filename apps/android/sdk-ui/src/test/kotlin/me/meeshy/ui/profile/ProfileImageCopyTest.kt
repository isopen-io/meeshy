package me.meeshy.ui.profile

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProfileImageCopyTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `labels are the english defaults`() {
        assertThat(ProfileImageCopy.bannerLabel(context)).isEqualTo("Profile banner")
        assertThat(ProfileImageCopy.openFullscreenHint(context)).isEqualTo("Opens the photo fullscreen")
    }

    @Test
    @Config(qualifiers = "fr")
    fun `labels follow the french iOS catalog`() {
        assertThat(ProfileImageCopy.bannerLabel(context)).isEqualTo("Bannière de profil")
        assertThat(ProfileImageCopy.openFullscreenHint(context)).isEqualTo("Ouvre la photo en plein écran")
    }

    @Test
    fun `the accessibility action label equals the hint`() {
        assertThat(ProfileImageCopy.openFullscreenActionLabel(context)).isEqualTo(ProfileImageCopy.openFullscreenHint(context))
    }

    @Test
    fun `tap is recorded only when an url exists`() {
        val opened = mutableListOf<ProfileFullscreenImage>()
        ProfileFullscreenImage.opening(null, "Ada")?.let(opened::add)
        ProfileFullscreenImage.opening("", "Ada")?.let(opened::add)
        assertThat(opened).isEmpty()
        ProfileFullscreenImage.opening("https://x/a.jpg", "Ada")?.let(opened::add)
        assertThat(opened).hasSize(1)
    }
}
