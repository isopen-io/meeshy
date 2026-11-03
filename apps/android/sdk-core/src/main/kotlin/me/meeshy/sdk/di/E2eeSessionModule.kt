package me.meeshy.sdk.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.crypto.session.DirectMessageEncrypting
import me.meeshy.core.crypto.session.E2eeSessionClearer
import me.meeshy.core.crypto.session.E2eeSessionManager
import me.meeshy.core.crypto.session.PeerBundleSource
import me.meeshy.core.datastore.SecretVault
import me.meeshy.sdk.e2ee.SignalPeerBundleSource
import me.meeshy.sdk.e2ee.SignalRepository
import me.meeshy.sdk.model.security.SecureStore
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Singleton

/** Les sessions E2EE directes : un gestionnaire par processus, branché sur le compte courant et la passerelle Signal. */
@Module
@InstallIn(SingletonComponent::class)
internal object E2eeSessionModule {
    @Provides
    @Singleton
    fun providesPeerBundleSource(repository: SignalRepository): PeerBundleSource = SignalPeerBundleSource(repository)

    @Provides
    @Singleton
    fun providesSessionManager(
        @SecretVault vault: SecureStore,
        peers: PeerBundleSource,
        session: SessionRepository,
    ): E2eeSessionManager = E2eeSessionManager(vault = vault, peers = peers, currentUserId = { session.currentUserId })

    @Provides
    fun providesDirectMessageEncrypting(manager: E2eeSessionManager): DirectMessageEncrypting = manager

    @Provides
    fun providesSessionClearer(manager: E2eeSessionManager): E2eeSessionClearer = manager
}
