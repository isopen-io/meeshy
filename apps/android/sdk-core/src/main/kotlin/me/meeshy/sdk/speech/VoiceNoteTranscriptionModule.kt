package me.meeshy.sdk.speech

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import me.meeshy.core.common.IoDispatcher
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object VoiceNoteTranscriptionModule {
    /** Le transcripteur de vocaux : un par processus, sa propre portée (une reconnaissance survit à l'écran qui l'a lancée). */
    @Provides
    @Singleton
    fun provideVoiceNoteLocalTranscriber(
        files: SoundFileTranscriber,
        @IoDispatcher io: CoroutineDispatcher,
    ): VoiceNoteLocalTranscriber = VoiceNoteLocalTranscriber(
        scope = CoroutineScope(SupervisorJob() + io),
        transcribe = files::transcribe,
    )
}
