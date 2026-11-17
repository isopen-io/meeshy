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
 * réseau rend `null` et garde la liste d'avant (hors ligne, « inconnu » n'est pas « aucune »). Vidée à la déconnexion.
 */
@Singleton
class MyAddressesRepository @Inject constructor(
    private val api: MyAddressesApi,
) : PerAccountCache {

    private val held = AtomicReference<List<MyAddress>?>(null)

    fun cached(): List<MyAddress>? = held.get()

    suspend fun refresh(): List<MyAddress>? = when (val result = apiCall { api.list() }) {
        is NetworkResult.Success -> MyAddresses.decode(result.data.addresses).also { held.set(it) }
        is NetworkResult.Failure -> if (result.error.httpStatus == NOT_FOUND) emptyList<MyAddress>().also { held.set(it) } else null
    }

    override suspend fun clear() {
        held.set(null)
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
