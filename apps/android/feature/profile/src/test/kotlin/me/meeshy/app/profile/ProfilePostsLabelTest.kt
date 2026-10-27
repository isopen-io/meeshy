package me.meeshy.app.profile

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.profile.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13387 — l'onglet des publications d'un profil dit « Publications » en français, jamais « Postes » (les bureaux de poste). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ProfilePostsLabelTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `the profile posts tab is called Publications in French`() {
        assertThat(context.getString(R.string.profile_tab_posts)).isEqualTo("Publications")
        assertThat(context.getString(R.string.profile_view_posts)).isEqualTo("Publications")
    }
}
