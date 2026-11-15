package me.meeshy.sdk.preferences

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.audio.AudioPreferencesStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.voice.ConsentsRepository
import java.util.TimeZone
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object UserPreferencesProvidesModule {
    @Provides
    @Singleton
    fun providesUserPreferencesManager(
        sync: CategorySyncRepository,
        snapshotStore: PreferenceSnapshotStore,
        notificationStore: NotificationPreferencesStore,
        privacyStore: PrivacyPreferencesStore,
        audioStore: AudioPreferencesStore,
        consents: ConsentsRepository,
        connection: SocketManager,
        coordinator: PreferencesSyncCoordinator,
        clock: CacheClock,
    ): UserPreferencesManager = UserPreferencesManager(
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
        sync = sync,
        snapshotStore = snapshotStore,
        notificationStore = notificationStore,
        privacyStore = privacyStore,
        audioStore = audioStore,
        consents = consents,
        connection = connection,
        coordinator = coordinator,
        clock = clock,
        utcOffsetMinutes = { TimeZone.getDefault().getOffset(System.currentTimeMillis()) / MILLIS_PER_MINUTE },
    )

    private const val MILLIS_PER_MINUTE = 60_000
}

@Module
@InstallIn(SingletonComponent::class)
internal interface UserPreferencesBindingsModule {
    @Binds @IntoSet
    fun realtimeBinding(manager: UserPreferencesManager): RealtimeBinding

    @Binds @IntoSet
    fun lifecycleHook(manager: UserPreferencesManager): AppLifecycleHook

    @Binds @IntoSet
    fun accountCache(manager: UserPreferencesManager): PerAccountCache
}
