package me.meeshy.sdk.relation

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.currentTime
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.LocationPermissionGate
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationOwnSnapshot
import me.meeshy.sdk.model.relation.SharedLocationStartRequest
import me.meeshy.sdk.model.relation.SharedLocationStartVerdict

/**
 * Un appareil du compte « me » : son stockage survit à un « relancement » (un second centre sur le même stockage).
 * Partagé par les témoins du centre qui jouent plusieurs appareils (#18578, #20248, #20249).
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class SharingDevice(
    private val scope: TestScope,
    val saved: MutableMap<String, String?> = mutableMapOf(),
    val receivedMarks: MutableMap<String, Boolean> = mutableMapOf(),
    val startMarks: MutableMap<String, String?> = mutableMapOf(),
) {
    var servedSnapshot: SharedLocationOwnSnapshot? = null
    var servedFailure: Exception? = null

    /** Une panne qu'on laisse courir rejoue la relecture toutes les 30 s pour toujours : `runTest`, qui avance
     * l'horloge virtuelle jusqu'au repos, ne finirait jamais. Le témoin la lève une fois ses assertions faites. */
    fun endOutage() {
        servedFailure = null
    }
    var servedGate: CompletableDeferred<Unit>? = null
    var account: String? = "me"
    val writes = mutableListOf<String>()
    var startVerdict: SharedLocationStartVerdict = SharedLocationStartVerdict.Started(0L)
    var updateVerdict: SharedLocationStartVerdict = SharedLocationStartVerdict.Started(0L)
    val connected = MutableStateFlow(false)
    val ownChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val starts = mutableListOf<SharedLocationStartRequest>()
    val updates = mutableListOf<SharedLocationFix>()
    var stops = 0
    var reads = 0
    var fixAsks = 0

    /** Ce qui se passe AILLEURS pendant que l'appareil attend son relevé (un autre appareil du compte). */
    var onFix: (() -> Unit)? = null

    /** Ce qui se passe AILLEURS pendant que le démarrage voyage (la passerelle le juge sur ce qu'elle sert alors). */
    var onStart: (() -> Unit)? = null
    val queuedStartVerdicts = ArrayDeque<SharedLocationStartVerdict>()
    var following = 0
    val stream = MutableSharedFlow<LiveLocationFix>(extraBufferCapacity = 8)

    val center = SharedLocationSharingCenter(
        emitter = object : SharedLocationEmitting {
            override suspend fun start(request: SharedLocationStartRequest): SharedLocationStartVerdict {
                starts += request
                onStart?.invoke()
                return queuedStartVerdicts.removeFirstOrNull() ?: startVerdict
            }
            override suspend fun update(fix: SharedLocationFix): SharedLocationStartVerdict {
                updates += fix
                return updateVerdict
            }
            override suspend fun stop(): Boolean {
                stops++
                return true
            }
        },
        fixes = object : LiveLocationFixSource {
            override suspend fun currentFix(): LiveLocationFix {
                fixAsks++
                onFix?.invoke()
                return LiveLocationFix(48.8566, 2.3522, accuracy = 8.0)
            }
            override fun updates(intervalMillis: Long): Flow<LiveLocationFix> {
                following++
                return stream
            }
        },
        permission = LocationPermissionGate { true },
        store = object : SharedLocationRosterStoring {
            override fun load(accountId: String): String? = saved[accountId]
            override fun save(accountId: String, stored: String?) {
                writes += "roster:$accountId"
                saved[accountId] = stored
            }
            override fun loadReceived(accountId: String): Boolean = receivedMarks[accountId] == true
            override fun saveReceived(accountId: String, received: Boolean) {
                writes += "received:$accountId=$received"
                receivedMarks[accountId] = received
            }
            override fun loadPublishedStart(accountId: String): String? = startMarks[accountId]
            override fun savePublishedStart(accountId: String, startedAt: String?) {
                startMarks[accountId] = startedAt
            }
        },
        accountId = { account },
        connected = connected,
        clock = { scope.currentTime },
        dispatcher = StandardTestDispatcher(scope.testScheduler),
        ownChanged = ownChanged,
        served = {
            reads++
            servedGate?.await()
            servedFailure?.let { throw it }
            servedSnapshot
        },
    )

    fun relaunched(): SharingDevice = SharingDevice(scope, saved, receivedMarks, startMarks)
}
