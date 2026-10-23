package me.meeshy.sdk.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.crypto.keys.E2eeKeyStore
import me.meeshy.core.crypto.keys.PreKeyBundleFactory
import me.meeshy.core.datastore.SecretVault
import me.meeshy.sdk.e2ee.E2eeAccountSource
import me.meeshy.sdk.e2ee.E2eeBundlePublicationFlag
import me.meeshy.sdk.e2ee.E2eeBundlePublishScheduler
import me.meeshy.sdk.e2ee.LocalBundleSource
import me.meeshy.sdk.e2ee.SignalBundleGateway
import me.meeshy.sdk.e2ee.SignalRepository
import me.meeshy.sdk.e2ee.WorkManagerE2eeBundlePublishScheduler
import me.meeshy.sdk.model.security.SecureStore
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/** Les clés E2EE de l'appareil, dans le coffre général, une identité par compte. */
internal class VaultLocalBundleSource @Inject constructor(
    @SecretVault private val vault: SecureStore,
) : LocalBundleSource {
    private val lock = Any()

    override fun bundleFor(userId: String): SignalPreKeyBundle =
        synchronized(lock) { PreKeyBundleFactory(E2eeKeyStore(vault, userId)).create() }

    override fun resetIdentity(userId: String) = synchronized(lock) { E2eeKeyStore(vault, userId).resetIdentity() }

    override fun forget(userId: String) = synchronized(lock) { E2eeKeyStore(vault, userId).clearAll() }
}

/** Publication désactivée par défaut : la passerelle garde UN bundle par utilisateur (E2EE par appareil non tranché). */
internal class DisabledBundlePublicationFlag @Inject constructor() : E2eeBundlePublicationFlag {
    override fun isEnabled(): Boolean = false
}

internal class SessionE2eeAccountSource @Inject constructor(
    private val session: SessionRepository,
) : E2eeAccountSource {
    override fun activeUserId(): String? = session.currentUserId
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class E2eeModule {
    @Binds abstract fun bindsGateway(impl: SignalRepository): SignalBundleGateway

    @Binds abstract fun bindsLocalSource(impl: VaultLocalBundleSource): LocalBundleSource

    @Binds abstract fun bindsFlag(impl: DisabledBundlePublicationFlag): E2eeBundlePublicationFlag

    @Binds abstract fun bindsAccount(impl: SessionE2eeAccountSource): E2eeAccountSource

    @Binds abstract fun bindsScheduler(impl: WorkManagerE2eeBundlePublishScheduler): E2eeBundlePublishScheduler
}
