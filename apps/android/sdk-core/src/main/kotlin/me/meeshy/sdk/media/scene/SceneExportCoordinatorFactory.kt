package me.meeshy.sdk.media.scene

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.media.CaptureGallery

/**
 * Fabrique du [SceneExportCoordinator] d'un écran : le moteur Media3 et le dossier temporaire (cache, jamais le stockage
 * partagé) sont ceux de l'application ; la portée est celle de l'écran, pour qu'un bake ne lui survive pas.
 */
@Singleton
public class SceneExportCoordinatorFactory @Inject constructor(
    @ApplicationContext private val context: Context,
    private val gallery: CaptureGallery,
) {
    public fun create(scope: CoroutineScope): SceneExportCoordinator = SceneExportCoordinator(
        runner = Media3SceneTransformRunner(context, Dispatchers.Main),
        gallery = gallery,
        tempDirectory = File(context.cacheDir, EXPORT_DIRECTORY),
        scope = scope,
    )

    private companion object {
        const val EXPORT_DIRECTORY = "scene-exports"
    }
}
