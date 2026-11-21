package me.meeshy.sdk.profile

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.model.profile.MyAddress
import me.meeshy.sdk.model.profile.MyAddresses
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MyAddressesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * « Mes adresses » de la face Liens, cache-first : la dernière liste lue se peint d'abord ([cached]), puis [refresh] la revalide
 * en silence. Un serveur qui ne les sert pas encore (404) rend une liste VIDE — la section n'apparaît simplement pas ; un échec
 * réseau rend `null` et garde la liste d'avant (hors ligne, « inconnu » n'est pas « aucune »). Vidée à la déconnexion, et une
 * lecture partie avant la déconnexion ne remplit jamais le cache du compte suivant : chaque [clear] ouvre une nouvelle époque.
 */
@Singleton
class MyAddressesRepository @Inject constructor(
    private val api: MyAddressesApi,
) : PerAccountCache {

    private data class Held(val epoch: Long = 0, val addresses: List<MyAddress>? = null)

    private val held = AtomicReference(Held())

    fun cached(): List<MyAddress>? = held.get().addresses

    suspend fun refresh(): List<MyAddress>? {
        val epoch = held.get().epoch
        val read: List<MyAddress> = when (val result = apiCall { api.list() }) {
            is NetworkResult.Success -> MyAddresses.decode(result.data.addresses)
            is NetworkResult.Failure -> if (result.error.httpStatus == NOT_FOUND) emptyList() else return null
        }
        val kept = held.updateAndGet { if (it.epoch == epoch) it.copy(addresses = read) else it }
        return read.takeIf { kept.epoch == epoch }
    }

    override suspend fun clear() {
        held.updateAndGet { Held(epoch = it.epoch + 1) }
    }

    private companion object {
        const val NOT_FOUND = 404
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class MyAddressesCacheModule {
    @Binds
    @IntoSet
    abstract fun bindAccountCache(repository: MyAddressesRepository): PerAccountCache
}
