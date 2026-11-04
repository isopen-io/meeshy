package me.meeshy.sdk.sync

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.socket.FriendRequestSocketEventsManager

/**
 * Fait revenir le cache d'amitié en arrière quand l'autre partie retire ou refuse sa demande (miroir de
 * `applyFriendRequestWithdrawal` / `applyFriendRequestRejection`, iOS) : le bouton « Ajouter » réapparaît sans
 * relecture. Le cache persisté est en plus invalidé, sinon l'écran des demandes resterait « frais » avec la ligne
 * retirée. Idempotent, écran ouvert ou non.
 */
@Singleton
class FriendshipRealtimeApplier @Inject constructor(
    private val socket: FriendRequestSocketEventsManager,
    private val cache: FriendshipCache,
) : RealtimeCacheApplier {

    override fun subscribe(registrar: RelayRegistrar) {
        val lane = OrderedEventLane.Family.CONVERSATIONS
        registrar.relay(socket.cancelled, lane) {
            cache.didWithdrawRequest(it.cancelledBy)
            cache.invalidatePersistedFriendCaches()
        }
        registrar.relay(socket.rejected, lane) {
            cache.didCancelRequest(it.rejecterId)
            cache.invalidatePersistedFriendCaches()
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FriendshipRealtimeModule {
    @Binds
    @IntoSet
    fun bindApplier(applier: FriendshipRealtimeApplier): RealtimeCacheApplier
}
