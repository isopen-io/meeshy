package me.meeshy.app.chat

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.playback.MediaResumeMerge
import me.meeshy.sdk.playback.SharedPreferencesPlaybackPositionStore

/**
 * **Où l'appareil a laissé chaque vocal** — la lecture seule que le plein écran audio demande au magasin de positions du
 * moteur (iOS `AudioPlaybackPositionStore.shared.position(for:)`). Locale à l'appareil, purgée à la déconnexion par le
 * magasin lui-même ; le plein écran n'écrit jamais.
 */
fun interface ChatRestingPositions {
    fun position(attachmentId: String): MediaResumeMerge.StampedPosition?
}

/** Le magasin unique du moteur ([SharedPreferencesPlaybackPositionStore]), vu en lecture par le fil. */
@Module
@InstallIn(SingletonComponent::class)
object ChatAudioRestingModule {

    @Provides
    fun restingPositions(positions: SharedPreferencesPlaybackPositionStore): ChatRestingPositions =
        ChatRestingPositions(positions::position)
}
