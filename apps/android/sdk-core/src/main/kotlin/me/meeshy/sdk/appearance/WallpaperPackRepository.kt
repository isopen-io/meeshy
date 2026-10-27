package me.meeshy.sdk.appearance

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.InstalledPackSummary
import me.meeshy.sdk.model.appearance.WallpaperPackOptions
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PackApi
import me.meeshy.sdk.net.api.installed
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache

/**
 * Les packs de fonds installés et possédés (`GET /packs/wallpaper/installed`) — cache d'abord : la dernière liste lue
 * pour CE compte se repeint aussitôt à la réouverture du sélecteur (`InstalledWallpapersMemo` d'iOS), la relecture
 * réseau la remplace. Une panne ne conclut rien (`null` : les packs installés d'office) ; un 404 (ancien serveur) ⇒ aucun pack.
 */
@Singleton
class WallpaperPackRepository @Inject constructor(private val api: PackApi) : PerAccountCache {

    @Volatile
    private var memo: List<InstalledPackSummary>? = null

    /** La dernière liste lue pour ce compte, sans réseau. */
    val cached: List<InstalledPackSummary>? get() = memo

    suspend fun refresh(): List<InstalledPackSummary>? {
        val list = when (val result = apiCall { api.installed(AppearancePackDomain.WALLPAPER) }) {
            is NetworkResult.Success -> result.data.packs
            is NetworkResult.Failure -> WallpaperPackOptions.installedFromFailure(result.error.httpStatus)
        }
        if (list != null) memo = list
        return list
    }

    override suspend fun clear() {
        memo = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class WallpaperPackModule {
    @Binds
    @IntoSet
    abstract fun bindWallpaperPackAccountCache(impl: WallpaperPackRepository): PerAccountCache

    companion object {
        @Provides
        @Singleton
        fun providePackApi(api: MeeshyApi): PackApi = api.service(PackApi::class.java)
    }
}
