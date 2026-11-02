package me.meeshy.app.navigation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppOverlay

@Module
@InstallIn(SingletonComponent::class)
interface RootIntentModule {
    @Binds
    @IntoSet
    fun rootIntentOverlay(overlay: RootIntentOverlay): AppOverlay
}
