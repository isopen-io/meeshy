package me.meeshy.sdk.attachment

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** Les demandes de transcription en attente sont celles d'un compte : la fin de session les oublie. */
@Module
@InstallIn(SingletonComponent::class)
abstract class TranscriptionRequestModule {

    @Binds
    @IntoSet
    abstract fun accountCache(impl: TranscriptionRequestTracker): PerAccountCache
}
