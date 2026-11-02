package me.meeshy.sdk.reading

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlag
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlags
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LentilleFeatureFlagsStoreTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(SharedPreferencesLentilleFeatureFlagsStore.FILE_NAME, Context.MODE_PRIVATE)
            .edit().clear().commit()
    }

    private fun newStore() = SharedPreferencesLentilleFeatureFlagsStore(context)

    @Test
    fun `sans choix écrit, les trois sont actifs`() {
        assertThat(newStore().flags.value).isEqualTo(LentilleFeatureFlags())
    }

    @Test
    fun `un choix survit au redémarrage du processus`() {
        newStore().setEnabled(LentilleFeatureFlag.READING_MODES, false)
        val reborn = newStore()
        assertThat(reborn.flags.value.readingModes).isFalse()
        assertThat(reborn.flags.value.lentilleList).isTrue()
    }

    @Test
    fun `le choix se publie sans attendre le disque`() {
        val store = newStore()
        store.setEnabled(LentilleFeatureFlag.RIVIERE_MODE, false)
        assertThat(store.flags.value.riviereMode).isFalse()
    }

    @Test
    fun `rallumer écrit true plutôt que de retirer la clé`() {
        val store = newStore()
        store.setEnabled(LentilleFeatureFlag.LENTILLE_LIST, false)
        store.setEnabled(LentilleFeatureFlag.LENTILLE_LIST, true)
        val prefs = context.getSharedPreferences(
            SharedPreferencesLentilleFeatureFlagsStore.FILE_NAME,
            Context.MODE_PRIVATE,
        )
        assertThat(prefs.contains("meeshy.flag.lentille_list")).isTrue()
        assertThat(prefs.getBoolean("meeshy.flag.lentille_list", false)).isTrue()
    }

    @Test
    fun `les clés écrites sont celles que lit le fil de discussion`() {
        newStore().setEnabled(LentilleFeatureFlag.READING_MODES, false)
        val prefs = context.getSharedPreferences("meeshy.readingModes", Context.MODE_PRIVATE)
        assertThat(prefs.getBoolean("meeshy.flag.reading_modes", true)).isFalse()
    }
}
