package me.meeshy.app.push.enrich

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.push.pipeline.NotificationEnricher

/** Contribue l'enrichisseur média au pipeline push (point d'extension `NotificationEnricher`). */
@Module
@InstallIn(SingletonComponent::class)
internal interface PushRichMediaModule {

    @Binds
    @IntoSet
    fun richMediaEnricher(impl: RichMediaEnricher): NotificationEnricher
}
