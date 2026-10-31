package me.meeshy.sdk.media.scene

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import okhttp3.Authenticator
import okhttp3.OkHttpClient
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.model.net.MediaUrlPolicy
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * Fabrique du [SceneExportCoordinator] d'un écran : le moteur Media3 et le dossier temporaire (cache, jamais le stockage
 * partagé) sont ceux de l'application ; la portée est celle de l'écran, pour qu'un bake ne lui survive pas.
 *
 * Le [fetcher] part du client de l'application DÉPOUILLÉ de ses intercepteurs et de son authentificateur (il garde
 * l'épinglage des certificats) : le jeton du compte ne voyage que vers la route des sons de la bibliothèque.
 */
@Singleton
public class SceneExportCoordinatorFactory @Inject constructor(
    @ApplicationContext private val context: Context,
    private val gallery: CaptureGallery,
    private val config: MeeshyConfig,
    private val tokenStore: TokenStore,
    okHttp: OkHttpClient,
) {
    public val fetcher: SceneAssetFetcher = SceneAssetFetcher(
        client = okHttp.newBuilder()
            .apply {
                interceptors().clear()
                networkInterceptors().clear()
            }
            .authenticator(Authenticator.NONE)
            .build(),
        admits = { url -> url.startsWith("http") && MediaUrlPolicy.isAllowed(url, MediaUrlPolicy.isLocalEnvironment(config.apiBaseUrl)) },
        headers = { url -> MediaRequestCredential.headers(url, config.apiBaseUrl, tokenStore.jwt, tokenStore.sessionToken) },
    )

    /** L'adresse chargeable d'un média de la slide (clé de stockage, chemin ou URL complète). */
    public fun mediaUrl(raw: String): String = resolveMediaUrl(raw, config.apiBaseUrl)

    public fun create(scope: CoroutineScope): SceneExportCoordinator = SceneExportCoordinator(
        runner = Media3SceneTransformRunner(context, Dispatchers.Main),
        gallery = gallery,
        tempDirectory = File(context.cacheDir, EXPORT_DIRECTORY),
        scope = scope,
        proof = RenderedContentProof(),
    )

    private companion object {
        const val EXPORT_DIRECTORY = "scene-exports"
    }
}
