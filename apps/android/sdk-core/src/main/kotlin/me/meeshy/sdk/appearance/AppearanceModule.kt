package me.meeshy.sdk.appearance

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.net.api.PackAssetsApi
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Singleton
import timber.log.Timber

/**
 * Les deux coutures du [AppearanceCatalogLoader] : le fichier en assets et le journal. La logique
 * décidable (lecture une fois, catalogue vide plutôt que plantage) vit dans le chargeur, et dans
 * `AppearanceCatalog` côté `:core:model` ; ceci n'est que du câblage.
 */
@Module
@InstallIn(SingletonComponent::class)
public object AppearanceModule {

    @Provides
    @Singleton
    public fun providesAppearanceCatalogAsset(
        @ApplicationContext context: Context,
    ): AppearanceCatalogAsset =
        AppearanceCatalogAsset { context.assets.open(AppearanceCatalogLoader.ASSET_NAME) }

    @Provides
    @Singleton
    public fun providesAppearanceCatalogErrorLog(): AppearanceCatalogErrorLog =
        AppearanceCatalogErrorLog { cause, message -> Timber.e(cause, message) }

    /** Les contrats servis complètent le catalogue que sert [AppearanceCatalogLoader] (#16265). */
    @Provides
    @Singleton
    public fun providesServedAppearanceContractStore(
        @ApplicationContext context: Context,
        api: PackAssetsApi,
        @IoDispatcher io: CoroutineDispatcher,
        loader: AppearanceCatalogLoader,
    ): ServedAppearanceContractStore = ServedAppearanceContractStore(
        directory = File(context.noBackupFilesDir, ServedAppearanceContractStore.DIRECTORY),
        fetcher = PackAssetsContractFetcher(api),
        io = io,
        sink = loader::serve,
    )
}

/** Le décor servi d'un compte ne survit pas à un changement de compte. */
@Module
@InstallIn(SingletonComponent::class)
public abstract class ServedAppearanceAccountModule {
    @Binds
    @IntoSet
    public abstract fun bindServedAppearanceAccountCache(impl: ServedAppearanceContractStore): PerAccountCache
}

/** `GET /api/v1/pack-assets/<sha16>.json` : public, immuable ; lu au plus jusqu'au plafond, l'empreinte tranche ensuite. */
internal class PackAssetsContractFetcher(private val api: PackAssetsApi) : ServedContractFetching {
    override suspend fun fetch(src: String): ByteArray =
        api.file(src).use { body -> body.byteStream().use { it.readAtMost(MAX_READ) } }

    private fun java.io.InputStream.readAtMost(limit: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(BUFFER)
        while (out.size() < limit) {
            val read = read(buffer, 0, minOf(buffer.size, limit - out.size()))
            if (read < 0) break
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    private companion object {
        const val MAX_READ = 2 * 1024 * 1024 + 1
        const val BUFFER = 8_192
    }
}
