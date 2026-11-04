package me.meeshy.sdk.playback

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.socket.RealtimeBinding

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ConversationAudioLifecycleModule {
    @Binds
    @IntoSet
    abstract fun lifecycle(binding: ConversationAudioLifecycleBinding): RealtimeBinding
}
