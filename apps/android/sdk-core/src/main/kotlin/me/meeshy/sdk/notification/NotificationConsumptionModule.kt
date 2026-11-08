package me.meeshy.sdk.notification

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.socket.RealtimeBinding

@Module
@InstallIn(SingletonComponent::class)
internal abstract class NotificationConsumptionModule {
    @Binds
    @IntoSet
    abstract fun consumptionSocket(binding: NotificationConsumptionSocketBinding): RealtimeBinding

    @Binds
    @IntoSet
    abstract fun activeContext(binding: ActiveContextConsumptionBinding): RealtimeBinding

    @Binds
    @IntoSet
    abstract fun perAccount(service: NotificationConsumptionService): PerAccountCache
}
