package me.meeshy.app.conversations.links

import android.content.Context
import android.content.res.Configuration
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.conversations.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LinkCountPluralsTest {

    private fun resourcesIn(tag: String) = RuntimeEnvironment.getApplication().let { base ->
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        (base as Context).createConfigurationContext(configuration).resources
    }

    @Test
    fun `un lien et un groupe se disent au singulier, deux au pluriel, en francais`() {
        val fr = resourcesIn("fr")
        assertThat(fr.getQuantityString(R.plurals.links_count_links, 1)).isEqualTo("lien")
        assertThat(fr.getQuantityString(R.plurals.links_count_links, 2)).isEqualTo("liens")
        assertThat(fr.getQuantityString(R.plurals.links_count_groups, 1)).isEqualTo("groupe")
        assertThat(fr.getQuantityString(R.plurals.links_count_groups, 0)).isEqualTo("groupe")
        assertThat(fr.getQuantityString(R.plurals.links_count_groups, 3)).isEqualTo("groupes")
    }

    @Test
    fun `les sept langues accordent le nom de lien au nombre`() {
        listOf("en" to "links", "es" to "enlaces", "pt" to "links", "de" to "Links", "ar" to "روابط").forEach { (tag, plural) ->
            assertThat(resourcesIn(tag).getQuantityString(R.plurals.links_count_links, 5)).isEqualTo(plural)
        }
        assertThat(resourcesIn("en").getQuantityString(R.plurals.links_count_links, 1)).isEqualTo("link")
        assertThat(resourcesIn("ar").getQuantityString(R.plurals.links_count_links, 2)).isEqualTo("رابطان")
    }
}
