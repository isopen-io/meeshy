package me.meeshy.sdk.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onStart
import me.meeshy.sdk.model.NetworkPathSnapshot
import me.meeshy.sdk.model.call.CallNetworkPath
import me.meeshy.sdk.network.NetworkPathSource
import javax.inject.Inject

/** L'économie de données du système (Data Saver), lue à la demande et signalée à chaque bascule. */
internal interface CallDataSaver {
    fun isEnabled(): Boolean
    val changes: Flow<Unit>
}

internal class AndroidCallDataSaver(
    private val context: Context,
    private val connectivity: ConnectivityManager,
) : CallDataSaver {

    override fun isEnabled(): Boolean = runCatching {
        connectivity.restrictBackgroundStatus != ConnectivityManager.RESTRICT_BACKGROUND_STATUS_DISABLED
    }.getOrDefault(false)

    override val changes: Flow<Unit> = callbackFlow {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                trySend(Unit)
            }
        }
        val filter = IntentFilter(ConnectivityManager.ACTION_RESTRICT_BACKGROUND_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
        awaitClose { runCatching { context.unregisterReceiver(receiver) } }
    }
}

/**
 * Le chemin réseau d'un appel (iOS `CallNetworkPathMonitor`, #8697), lu dans l'UNIQUE [NetworkPathSource] du SDK — aucun
 * second rappel réseau n'est enregistré (`NetworkCallbackSingleSiteGuardTest`). [CallNetworkPath.isExpensive] = lien à
 * l'usage (pas `NOT_METERED`) ; [CallNetworkPath.isConstrained] = Data Saver actif SUR un lien à l'usage (hors Wi-Fi
 * non facturé le système ne restreint rien, l'appel garde alors son profil Wi-Fi).
 *
 * [current] rend le chemin déjà connu, de façon synchrone : l'orchestrateur le lit AVANT la première offre, qui porte
 * ainsi le bon fmtp Opus au lieu de celui du Wi-Fi. [paths] émet ce même chemin d'abord, puis chaque changement.
 */
public class CallNetworkPathMonitor internal constructor(
    private val source: NetworkPathSource,
    private val dataSaver: CallDataSaver,
) {
    @Inject
    public constructor(
        source: NetworkPathSource,
        @ApplicationContext context: Context,
    ) : this(
        source,
        AndroidCallDataSaver(
            context.applicationContext,
            context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager,
        ),
    )

    public fun current(): CallNetworkPath = pathOf(source.snapshot.value)

    public val paths: Flow<CallNetworkPath> =
        merge(source.snapshot.map { }, dataSaver.changes)
            .onStart { emit(Unit) }
            .map { current() }
            .distinctUntilChanged()

    private fun pathOf(snapshot: NetworkPathSnapshot): CallNetworkPath {
        val metered = snapshot.isSatisfied && snapshot.isConstrained
        return CallNetworkPath(isExpensive = metered, isConstrained = metered && dataSaver.isEnabled())
    }
}
