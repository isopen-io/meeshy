package me.meeshy.app.push

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dagger.multibindings.Multibinds
import me.meeshy.app.push.pipeline.BannerAccentEnricher
import me.meeshy.app.push.pipeline.NotificationEnricher

/** Les points d'extension du rendu (déclarés vides) et l'enrichisseur d'accent (#15182). */
@Module
@InstallIn(SingletonComponent::class)
interface PushRenduModule {

    @Multibinds
    fun bannerDecorators(): Set<@JvmSuppressWildcards PushBannerDecorator>

    @Multibinds
    fun displayGates(): Set<@JvmSuppressWildcards PushDisplayGate>

    @Multibinds
    fun actionProviders(): Set<@JvmSuppressWildcards PushActionProvider>

    @Binds
    @IntoSet
    fun bannerAccentEnricher(impl: BannerAccentEnricher): NotificationEnricher
}
