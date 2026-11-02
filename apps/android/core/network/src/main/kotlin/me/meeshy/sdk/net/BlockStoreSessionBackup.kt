package me.meeshy.sdk.net

import android.content.Context
import com.google.android.gms.auth.blockstore.Blockstore
import com.google.android.gms.auth.blockstore.BlockstoreClient
import com.google.android.gms.auth.blockstore.DeleteBytesRequest
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest
import com.google.android.gms.auth.blockstore.StoreBytesData
import com.google.android.gms.tasks.Tasks
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * [SessionBackup] sur le Block Store de Google Play Services (#14058) : la session survit à la désinstallation
 * sur CET appareil, comme une entrée de Keychain `ThisDeviceOnly`. `setShouldBackupToCloud(false)` : rien ne part
 * vers le nuage. Le Block Store garde pourtant ses données pour un transfert d'un téléphone à l'autre : la charge
 * est donc liée à [deviceId] (`ANDROID_ID`, stable d'une réinstallation à l'autre sur le même appareil, différent
 * sur un autre), et une charge venue d'ailleurs est effacée sans être présentée à la passerelle.
 *
 * Écritures et effacements partent dans l'ORDRE, sur un fil unique, et seul le DERNIER état voulu part : un
 * effacement de déconnexion annule l'écriture encore en attente. Sans Play Services, chaque appel échoue en
 * silence : rien n'est gardé, rien n'est rendu.
 */
class BlockStoreSessionBackup(
    context: Context,
    private val key: String,
    private val deviceId: String,
) : SessionBackup {

    private sealed interface Wanted {
        class Stored(val bytes: ByteArray) : Wanted
        data object Erased : Wanted
    }

    private val appContext = context.applicationContext
    private val client: BlockstoreClient by lazy { Blockstore.getClient(appContext) }
    private val wanted = AtomicReference<Wanted?>(null)
    private val writes: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "meeshy-session-backup").apply { isDaemon = true }
    }

    override suspend fun read(): BackedUpSession? = withContext(Dispatchers.IO) {
        try {
            writes.submit {}.get(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            val request = RetrieveBytesRequest.Builder().setKeys(listOf(key)).build()
            val response = Tasks.await(client.retrieveBytes(request), READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            val bytes = response.blockstoreDataMap[key]?.bytes ?: return@withContext null
            val session = BackedUpSession.decode(bytes, deviceId)
            if (session == null) erase()
            session
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") unavailable: Exception) {
            null
        }
    }

    override fun save(session: BackedUpSession) = want(Wanted.Stored(session.encode(deviceId)))

    override fun erase() = want(Wanted.Erased)

    private fun want(state: Wanted) {
        wanted.set(state)
        writes.execute(::applyLatest)
    }

    private fun applyLatest() {
        val state = wanted.getAndSet(null) ?: return
        try {
            val task = when (state) {
                is Wanted.Stored -> client.storeBytes(
                    StoreBytesData.Builder().setKey(key).setBytes(state.bytes).setShouldBackupToCloud(false).build(),
                )
                Wanted.Erased -> client.deleteBytes(DeleteBytesRequest.Builder().setKeys(listOf(key)).build())
            }
            Tasks.await(task, WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (@Suppress("TooGenericExceptionCaught") unavailable: Exception) {
            // Pas de Play Services, ou le coffre a refusé : la session locale reste la seule, comme avant #14058.
        }
    }

    private companion object {
        const val READ_TIMEOUT_SECONDS = 5L
        const val WRITE_TIMEOUT_SECONDS = 30L
    }
}
