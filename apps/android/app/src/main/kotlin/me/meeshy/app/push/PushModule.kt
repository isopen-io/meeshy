package me.meeshy.app.push

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dagger.multibindings.Multibinds
import me.meeshy.app.push.pipeline.AndroidPushEnvironment
import me.meeshy.app.push.pipeline.BigTextEnricher
import me.meeshy.app.push.pipeline.EphemeralExpirationEnricher
import me.meeshy.app.push.pipeline.GroupAndBadgeEnricher
import me.meeshy.app.push.pipeline.ImageMediaEnricher
import me.meeshy.app.push.pipeline.NotificationEnricher
import me.meeshy.app.push.pipeline.PushEnvironment
import me.meeshy.app.push.pipeline.SubtitleEnricher

/**
 * The push pipeline's extension points : [PushObserver] and [NotificationEnricher] are
 * declared (empty-safe) here ; a lot contributes with `@Binds @IntoSet` from its own module.
 */
@Module
@InstallIn(SingletonComponent::class)
interface PushModule {

    @Multibinds
    fun pushObservers(): Set<@JvmSuppressWildcards PushObserver>

    @Multibinds
    fun notificationEnrichers(): Set<@JvmSuppressWildcards NotificationEnricher>

    @Binds
    fun pushEnvironment(impl: AndroidPushEnvironment): PushEnvironment

    @Binds
    @IntoSet
    fun subtitleEnricher(impl: SubtitleEnricher): NotificationEnricher

    @Binds
    @IntoSet
    fun bigTextEnricher(impl: BigTextEnricher): NotificationEnricher

    @Binds
    @IntoSet
    fun groupAndBadgeEnricher(impl: GroupAndBadgeEnricher): NotificationEnricher

    @Binds
    @IntoSet
    fun imageMediaEnricher(impl: ImageMediaEnricher): NotificationEnricher

    @Binds
    @IntoSet
    fun ephemeralExpirationEnricher(impl: EphemeralExpirationEnricher): NotificationEnricher
}
