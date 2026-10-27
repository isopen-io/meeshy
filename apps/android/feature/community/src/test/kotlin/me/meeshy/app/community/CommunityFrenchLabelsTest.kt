package me.meeshy.app.community

import android.content.Context
import android.content.res.Configuration
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.community.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CommunityFrenchLabelsTest {

    private val french = RuntimeEnvironment.getApplication().let { base ->
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.FRENCH) }
        (base as Context).createConfigurationContext(configuration)
    }

    @Test
    fun `les compteurs, onglets et listes d'une communauté sont en français`() {
        assertThat(french.getString(R.string.community_detail_stats_members)).isEqualTo("Membres")
        assertThat(french.getString(R.string.community_detail_stats_channels)).isEqualTo("Canaux")
        assertThat(french.getString(R.string.community_detail_action_channel)).isEqualTo("Canal")
        assertThat(french.getString(R.string.community_detail_tab_feed)).isEqualTo("Fil")
        assertThat(french.getString(R.string.community_members_title)).isEqualTo("Membres")
    }
}
