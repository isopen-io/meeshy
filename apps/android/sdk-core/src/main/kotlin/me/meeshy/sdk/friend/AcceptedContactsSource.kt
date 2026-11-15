package me.meeshy.sdk.friend

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactList
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La source UNIQUE des contacts acceptés (iOS `AcceptedContactsSource`) : l'annuaire et l'écran
 * « Nouvelle conversation » la lisent, et elle seule écrit le cache d'amis — jamais deux écrivains
 * qui divergent.
 *
 * - [cached] : le carnet persisté, servi avant tout réseau (`null` = cache froid, jamais synchronisé) ;
 * - [refresh] : UNE lecture `direction=any&status=accepted` par pages de 100 jusqu'à 500
 *   ([FriendRepository.acceptedFriendRequests]), assemblée par la définition partagée de « contact »
 *   ([ContactList.fromAcceptedRequests], y compris les relations où je suis receveur), puis écrite
 *   au cache sous le billet du compte qui a lancé la lecture.
 */
@Singleton
class AcceptedContactsSource @Inject constructor(
    private val friendRepository: FriendRepository,
    private val friendListRepository: FriendListRepository,
    private val sessionRepository: SessionRepository,
) {

    suspend fun cached(): List<FriendRequestUser>? =
        try {
            friendListRepository.cachedSnapshot()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }

    suspend fun refresh(): NetworkResult<List<FriendRequestUser>> {
        val ticket = friendListRepository.ticket()
        val me = sessionRepository.currentUserId.orEmpty()
        return when (val read = friendRepository.acceptedFriendRequests()) {
            is NetworkResult.Failure -> read
            is NetworkResult.Success -> {
                val roster = ContactList.fromAcceptedRequests(read.data, me)
                persistQuietly(roster, ticket)
                NetworkResult.Success(roster)
            }
        }
    }

    private suspend fun persistQuietly(roster: List<FriendRequestUser>, ticket: me.meeshy.sdk.session.AccountTicket?) {
        try {
            friendListRepository.persist(roster, ticket)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Un cache qui ne s'écrit pas ne retire rien à la liste servie.
        }
    }
}
