package me.meeshy.sdk.notification

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
internal abstract class NotificationCacheModule {
    @Binds
    abstract fun bindNotificationCacheStore(store: RoomNotificationCacheStore): NotificationCacheStore
}
