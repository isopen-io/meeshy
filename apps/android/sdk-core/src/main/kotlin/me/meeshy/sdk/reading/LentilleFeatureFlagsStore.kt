package me.meeshy.sdk.reading

import android.content.Context
import android.content.SharedPreferences
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlag
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlags
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les trois interrupteurs Lentille / modes de lecture / Rivière, réglés SUR L'APPAREIL comme la
 * langue de l'interface (iOS `LentilleFeatureFlag.setEnabled`, `UserDefaults`) — jamais envoyés à
 * la passerelle.
 */
public interface LentilleFeatureFlagsStore {
    public val flags: StateFlow<LentilleFeatureFlags>

    /** Écrit le choix. Rallumer ÉCRIT `true` plutôt que de retirer la clé : le choix survit à un changement de défaut. */
    public fun setEnabled(flag: LentilleFeatureFlag, enabled: Boolean)
}

/** Magasin volatil — tests et aperçus. */
public class InMemoryLentilleFeatureFlagsStore(
    initial: LentilleFeatureFlags = LentilleFeatureFlags(),
) : LentilleFeatureFlagsStore {
    private val state = MutableStateFlow(initial)
    override val flags: StateFlow<LentilleFeatureFlags> = state.asStateFlow()

    override fun setEnabled(flag: LentilleFeatureFlag, enabled: Boolean) {
        state.update { it.with(flag, enabled) }
    }
}

/**
 * Le magasin `SharedPreferences`. Il écrit dans le MÊME fichier et sous les MÊMES clés que le
 * lecteur du fil de discussion (`SharedPreferencesReadingModeStore`, fichier `meeshy.readingModes`,
 * clés `meeshy.flag.*`) : l'interrupteur coupé s'applique donc à la prochaine ouverture de
 * conversation sans que le fil ait à connaître les Réglages. Une clé absente vaut « actif ».
 */
@Singleton
public class SharedPreferencesLentilleFeatureFlagsStore @Inject constructor(
    @ApplicationContext context: Context,
) : LentilleFeatureFlagsStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val state = MutableStateFlow(read())
    override val flags: StateFlow<LentilleFeatureFlags> = state.asStateFlow()

    override fun setEnabled(flag: LentilleFeatureFlag, enabled: Boolean) {
        state.update { it.with(flag, enabled) }
        prefs.edit().putBoolean(flag.storageKey, enabled).apply()
    }

    private fun read(): LentilleFeatureFlags = LentilleFeatureFlag.entries.fold(LentilleFeatureFlags()) { acc, flag ->
        acc.with(flag, prefs.getBoolean(flag.storageKey, true))
    }

    internal companion object {
        /** Doit rester égal à `PREFS` de `ReadingModeController.kt` (`:feature:chat`). */
        const val FILE_NAME = "meeshy.readingModes"
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface LentilleFeatureFlagsModule {
    @Binds
    public fun bindsLentilleFeatureFlagsStore(store: SharedPreferencesLentilleFeatureFlagsStore): LentilleFeatureFlagsStore
}
