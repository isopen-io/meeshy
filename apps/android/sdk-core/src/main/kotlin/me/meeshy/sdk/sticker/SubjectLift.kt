package me.meeshy.sdk.sticker

import android.content.Context
import android.graphics.Bitmap
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

/**
 * Détourer le sujet d'une photo, SUR L'APPAREIL — miroir de `StickerSubjectLift` (iOS, `VNGenerateForegroundInstanceMaskRequest`).
 * [isAvailable] dit si le détourage est servi ici : faux, l'entrée « Détourer » n'est pas affichée (loi 4 : absente, jamais
 * grisée). [lift] rend le sujet sur fond transparent, `null` quand aucun sujet n'est trouvé ou que l'image est illisible.
 */
public interface SubjectLifting {
    public suspend fun isAvailable(): Boolean
    public suspend fun lift(image: Bitmap): Bitmap?
}

/**
 * Le détourage par ML Kit Subject Segmentation. Le modèle est un module des services Google Play, téléchargé à la
 * demande : tant qu'il n'est pas sur l'appareil, [isAvailable] est faux et son téléchargement est demandé en tâche de
 * fond — l'entrée apparaît à l'ouverture suivante. Un appareil sans services Google Play ne la voit jamais.
 */
@Singleton
public class MlKitSubjectLifter @Inject constructor(@ApplicationContext private val context: Context) : SubjectLifting {
    private val segmenter: SubjectSegmenter by lazy {
        SubjectSegmentation.getClient(SubjectSegmenterOptions.Builder().enableForegroundBitmap().build())
    }

    override suspend fun isAvailable(): Boolean = runCatching {
        val install = ModuleInstall.getClient(context)
        val available = install.areModulesAvailable(segmenter).awaitOrNull()?.areModulesAvailable() == true
        if (!available) install.deferredInstall(segmenter)
        available
    }.getOrDefault(false)

    override suspend fun lift(image: Bitmap): Bitmap? = withContext(Dispatchers.Default) {
        runCatching { segmenter.process(InputImage.fromBitmap(image, 0)).awaitOrNull()?.foregroundBitmap }.getOrNull()
    }
}

private suspend fun <T> Task<T>.awaitOrNull(): T? = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { continuation.resume(it) }
    addOnFailureListener { continuation.resume(null) }
    addOnCanceledListener { continuation.resume(null) }
}

@Module
@InstallIn(SingletonComponent::class)
public abstract class SubjectLiftModule {
    @Binds
    public abstract fun bindSubjectLifting(impl: MlKitSubjectLifter): SubjectLifting
}
