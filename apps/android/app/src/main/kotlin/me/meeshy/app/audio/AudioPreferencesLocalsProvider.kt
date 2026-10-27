package me.meeshy.app.audio

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.audio.AudioPreferencesStore
import me.meeshy.ui.component.bubble.LocalAutoRevealTranscription
import javax.inject.Inject

/**
 * Fournit `LocalAutoRevealTranscription` à tout l'arbre : la préférence `audio.autoTranscribeIncoming`
 * est lue une fois ici, les bulles vocales reçues décident d'elles-mêmes d'afficher le texte ou le
 * bouton « Transcrire » (iOS `BubbleAttachmentView` : `isMe || audio.autoTranscribeIncoming`).
 */
class AudioPreferencesLocalsProvider @Inject constructor(
    private val store: AudioPreferencesStore,
) : AppLocalsProvider {

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        val autoReveal = store.preferences.collectAsState().value.autoTranscribeIncoming
        CompositionLocalProvider(LocalAutoRevealTranscription provides autoReveal, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface AudioPreferencesLocalsModule {
    @Binds
    @IntoSet
    fun bindAudioPreferencesLocalsProvider(provider: AudioPreferencesLocalsProvider): AppLocalsProvider
}
