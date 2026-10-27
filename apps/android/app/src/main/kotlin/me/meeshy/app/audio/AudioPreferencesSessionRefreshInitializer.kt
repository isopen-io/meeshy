package me.meeshy.app.audio

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.audio.AudioPreferencesSyncRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * Relit `audio.autoTranscribeIncoming` à chaque compte inscrit qui s'ouvre, pour que la bulle d'un
 * vocal reçu suive le choix de la passerelle sans attendre l'ouverture des Réglages. Un invité de
 * lien n'a pas de bloc de préférences : il n'est pas relu.
 */
class AudioPreferencesSessionRefreshInitializer @Inject constructor(
    private val syncRepository: AudioPreferencesSyncRepository,
    private val session: SessionRepository,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            syncRepository.refreshOnEachAccount(
                session.currentUser.map { user -> user?.takeUnless { it.isAnonymous == true }?.id },
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface AudioPreferencesSessionRefreshModule {
    @Binds
    @IntoSet
    fun audioPreferencesSessionRefreshInitializer(impl: AudioPreferencesSessionRefreshInitializer): AppInitializer
}
