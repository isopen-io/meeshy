package me.meeshy.app.game

import android.content.Context
import android.content.res.Configuration
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.game.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AtlasCountPluralsTest {

    private fun resourcesIn(tag: String) = RuntimeEnvironment.getApplication().let { base ->
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        (base as Context).createConfigurationContext(configuration).resources
    }

    @Test
    fun `une langue tamponnee se dit au singulier`() {
        assertThat(resourcesIn("fr").getQuantityString(R.plurals.game_atlas_languages, 1, "1", "83")).isEqualTo("1 langue sur 83")
        assertThat(resourcesIn("fr").getQuantityString(R.plurals.game_atlas_languages, 2, "2", "83")).isEqualTo("2 langues sur 83")
        assertThat(resourcesIn("it").getQuantityString(R.plurals.game_atlas_languages, 1, "1", "83")).isEqualTo("1 lingua su 83")
    }
}
