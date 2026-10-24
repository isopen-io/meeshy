package me.meeshy.app.calls

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import me.meeshy.sdk.model.call.CallAudioRoute
import me.meeshy.sdk.model.call.CallAudioRouteKind
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que la plateforme rapporte à un instant : les routes, et celle qui porte le son. */
data class CallAudioRouteSnapshot(val routes: List<CallAudioRoute>, val activeId: Int?)

/** La couture testable de la feuille « Sortie » : lire les routes, en choisir une, écouter les changements. */
interface CallAudioRouteProviding {
    /** Émet à chaque branchement, débranchement ou changement de route de communication. */
    val routeChanges: Flow<Unit>

    fun snapshot(): CallAudioRouteSnapshot

    /** Rend vrai si la plateforme a accepté la route ; jamais d'exception vers l'appelant. */
    fun select(id: Int): Boolean
}

/** La permission qui rend les routes Bluetooth visibles (BLUETOOTH_CONNECT dès l'API 31). */
fun interface CallBluetoothPermission {
    fun isGranted(): Boolean
}

@Singleton
class AndroidCallBluetoothPermission @Inject constructor(
    @ApplicationContext private val context: Context,
) : CallBluetoothPermission {
    override fun isGranted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.BLUETOOTH_CONNECT) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
}

/**
 * Les sorties audio de l'appel côté plateforme : `availableCommunicationDevices` dès l'API 31,
 * `getDevices` plus le drapeau haut-parleur / SCO en dessous. Tout est de la colle : la décision
 * de genre est celle, pure, de [CallAudioRouteKind].
 */
@Singleton
class CallAudioRouteService @Inject constructor(
    @ApplicationContext private val context: Context,
) : CallAudioRouteProviding {

    private val audioManager: AudioManager
        get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    override val routeChanges: Flow<Unit> = callbackFlow {
        val manager = audioManager
        val deviceCallback = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
                trySend(Unit)
            }

            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
                trySend(Unit)
            }
        }
        manager.registerAudioDeviceCallback(deviceCallback, null)
        val unregisterCommunication = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listenCommunicationDevice(manager, ContextCompat.getMainExecutor(context)) { trySend(Unit) }
        } else {
            NO_UNREGISTER
        }
        awaitClose {
            manager.unregisterAudioDeviceCallback(deviceCallback)
            unregisterCommunication()
        }
    }

    override fun snapshot(): CallAudioRouteSnapshot {
        val devices = outputDevices()
        val routes = devices.map { CallAudioRoute(it.id, label(it), CallAudioRouteKind.fromDeviceType(it.type)) }
        return CallAudioRouteSnapshot(routes, activeDeviceId(devices))
    }

    override fun select(id: Int): Boolean = try {
        val device = outputDevices().firstOrNull { it.id == id }
        when {
            device == null -> false
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> selectCommunicationDevice(audioManager, device)
            else -> selectLegacy(audioManager, device)
        }
    } catch (_: RuntimeException) {
        false
    }

    private fun outputDevices(): List<AudioDeviceInfo> {
        val manager = audioManager
        val raw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            communicationDevices(manager)
        } else {
            manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        }
        return raw.filter { CallAudioRouteKind.fromDeviceType(it.type) != CallAudioRouteKind.Other }
            .distinctBy { it.id }
    }

    private fun activeDeviceId(devices: List<AudioDeviceInfo>): Int? {
        val manager = audioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return activeCommunicationDeviceId(manager)
        @Suppress("DEPRECATION")
        val kind = when {
            manager.isSpeakerphoneOn -> CallAudioRouteKind.Speaker
            manager.isBluetoothScoOn -> CallAudioRouteKind.Bluetooth
            else -> null
        }
        return devices.firstOrNull { kind != null && CallAudioRouteKind.fromDeviceType(it.type) == kind }?.id
            ?: devices.firstOrNull { CallAudioRouteKind.fromDeviceType(it.type) == CallAudioRouteKind.Wired }?.id
            ?: devices.firstOrNull { CallAudioRouteKind.fromDeviceType(it.type) == CallAudioRouteKind.Earpiece }?.id
    }

    private fun label(device: AudioDeviceInfo): String {
        val name = device.productName?.toString().orEmpty()
        return if (CallAudioRouteKind.fromDeviceType(device.type).isExternal) name else ""
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun communicationDevices(manager: AudioManager): List<AudioDeviceInfo> =
        manager.availableCommunicationDevices

    @RequiresApi(Build.VERSION_CODES.S)
    private fun activeCommunicationDeviceId(manager: AudioManager): Int? = manager.communicationDevice?.id

    @RequiresApi(Build.VERSION_CODES.S)
    private fun selectCommunicationDevice(manager: AudioManager, device: AudioDeviceInfo): Boolean =
        manager.setCommunicationDevice(device)

    @RequiresApi(Build.VERSION_CODES.S)
    private fun listenCommunicationDevice(manager: AudioManager, executor: Executor, onChange: () -> Unit): () -> Unit {
        val listener = AudioManager.OnCommunicationDeviceChangedListener { onChange() }
        manager.addOnCommunicationDeviceChangedListener(executor, listener)
        return { manager.removeOnCommunicationDeviceChangedListener(listener) }
    }

    private companion object {
        val NO_UNREGISTER: () -> Unit = {}
    }

    @Suppress("DEPRECATION")
    private fun selectLegacy(manager: AudioManager, device: AudioDeviceInfo): Boolean {
        when (CallAudioRouteKind.fromDeviceType(device.type)) {
            CallAudioRouteKind.Speaker -> {
                manager.stopBluetoothSco()
                manager.isBluetoothScoOn = false
                manager.isSpeakerphoneOn = true
            }
            CallAudioRouteKind.Bluetooth -> {
                manager.isSpeakerphoneOn = false
                manager.startBluetoothSco()
                manager.isBluetoothScoOn = true
            }
            else -> {
                manager.stopBluetoothSco()
                manager.isBluetoothScoOn = false
                manager.isSpeakerphoneOn = false
            }
        }
        return true
    }
}
