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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * [AccountShelf] sur le Block Store (#14079) : une entrée par compte gardé, sous `<clé du serveur>.account.<id>`, à côté
 * de la session active ([BlockStoreSessionBackup]). Mêmes garanties : rien vers le nuage (`setShouldBackupToCloud(false)`),
 * charge liée à [deviceId] et effacée quand elle vient d'un autre appareil, écritures dans l'ordre sur un fil unique où
 * seul le DERNIER état voulu de chaque compte part. Sans Play Services, chaque appel échoue en silence.
 */
class BlockStoreAccountShelf(
    context: Context,
    serverKey: String,
    private val deviceId: String,
) : AccountShelf {

    private val prefix = "$serverKey$ACCOUNT_INFIX"
    private val appContext = context.applicationContext
    private val client: BlockstoreClient by lazy { Blockstore.getClient(appContext) }
    private val wanted = ConcurrentHashMap<String, ByteArray>()
    private val writes: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "meeshy-account-shelf").apply { isDaemon = true }
    }

    override suspend fun readAll(): List<BackedUpAccount> = withContext(Dispatchers.IO) {
        try {
            writes.submit {}.get(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            val request = RetrieveBytesRequest.Builder().setRetrieveAll(true).build()
            val response = Tasks.await(client.retrieveBytes(request), READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            response.blockstoreDataMap.entries
                .filter { (key, _) -> key.startsWith(prefix) }
                .mapNotNull { (key, data) ->
                    val account = BackedUpAccount.decode(data.bytes, deviceId)?.takeIf { key == keyOf(it.userId) }
                    if (account == null) erase(key.removePrefix(prefix))
                    account
                }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") unavailable: Exception) {
            emptyList()
        }
    }

    override fun save(account: BackedUpAccount) {
        val bytes = account.encode(deviceId) ?: return erase(account.userId)
        want(account.userId, bytes)
    }

    override fun erase(userId: String) = want(userId, ERASED)

    private fun want(userId: String, bytes: ByteArray) {
        wanted[userId] = bytes
        writes.execute { applyLatest(userId) }
    }

    private fun applyLatest(userId: String) {
        val bytes = wanted.remove(userId) ?: return
        try {
            val task = if (bytes === ERASED) {
                client.deleteBytes(DeleteBytesRequest.Builder().setKeys(listOf(keyOf(userId))).build())
            } else {
                client.storeBytes(StoreBytesData.Builder().setKey(keyOf(userId)).setBytes(bytes).setShouldBackupToCloud(false).build())
            }
            Tasks.await(task, WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (@Suppress("TooGenericExceptionCaught") unavailable: Exception) {
            // Pas de Play Services, ou le coffre a refusé : le compte ne vit que dans l'app, comme avant #14079.
        }
    }

    private fun keyOf(userId: String) = "$prefix$userId"

    private companion object {
        const val ACCOUNT_INFIX = ".account."
        val ERASED = ByteArray(0)
        const val READ_TIMEOUT_SECONDS = 5L
        const val WRITE_TIMEOUT_SECONDS = 30L
    }
}
