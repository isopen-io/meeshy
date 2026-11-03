package me.meeshy.sdk.media.scene

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import okhttp3.OkHttpClient
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.model.net.MediaUrlPolicy
import me.meeshy.sdk.net.HttpClientContributor
import me.meeshy.sdk.net.MediaHttpClient
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * Fabrique du [SceneExportCoordinator] d'un écran : le moteur Media3 et le dossier temporaire (cache, jamais le stockage
 * partagé) sont ceux de l'application ; la portée est celle de l'écran, pour qu'un bake ne lui survive pas.
 *
 * Le [fetcher] télécharge par un client des médias ([sceneAssetClient], #14877) : celui de l'application sans ses
 * intercepteurs d'API ni son authentificateur, MAIS avec l'épinglage des certificats et la frontière de session ; le
 * jeton du compte ne voyage que vers la route des sons de la bibliothèque, réévalué à chaque saut d'une redirection.
 */
@Singleton
public class SceneExportCoordinatorFactory @Inject constructor(
    @ApplicationContext private val context: Context,
    private val gallery: CaptureGallery,
    private val config: MeeshyConfig,
    private val tokenStore: TokenStore,
    okHttp: OkHttpClient,
    contributors: Set<@JvmSuppressWildcards HttpClientContributor>,
) {
    public val fetcher: SceneAssetFetcher = SceneAssetFetcher(
        client = sceneAssetClient(okHttp, contributors, config, tokenStore),
        admits = { url -> url.startsWith("http") && MediaUrlPolicy.isAllowed(url, MediaUrlPolicy.isLocalEnvironment(config.apiBaseUrl)) },
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

/**
 * Le client par lequel l'export d'une scène ramène ses médias (#14877) : la MÊME dérivation que les lecteurs Media3
 * ([MediaHttpClient.deriveForSignedMedia]) — épinglage et frontière de session gardés, aucun intercepteur d'API, aucune
 * redirection HTTPS vers HTTP suivie, et l'identité posée seulement vers la route des sons.
 */
internal fun sceneAssetClient(
    shared: OkHttpClient,
    contributors: Collection<HttpClientContributor>,
    config: MeeshyConfig,
    tokenStore: TokenStore,
): OkHttpClient = MediaHttpClient.deriveForSignedMedia(shared, contributors) { url ->
    MediaRequestCredential.headers(url, config.apiBaseUrl, tokenStore.jwt, tokenStore.sessionToken)
}
