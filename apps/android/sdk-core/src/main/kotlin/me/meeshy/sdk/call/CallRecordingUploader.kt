package me.meeshy.sdk.call

import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import java.io.File
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dépose le fichier d'un appel enregistré par TUS (reprise par tronçons, le fichier se lit sur disque, jamais en
 * mémoire) et rend l'identifiant de la PIÈCE JOINTE, que `CallRecordingApi.link` rattache à la bulle de l'appel.
 * Le contexte [TusUploadContext.ATTACHMENT] n'est aucun des quatre de publication : la passerelle crée une pièce
 * jointe de message, pas un média de post. Le nettoyage du fichier temporaire (succès ou échec) est celui du
 * contrôleur, qui possède le fichier. Miroir de `CallRecordingTusUploader` (iOS).
 */
@Singleton
public class TusCallRecordingUploader @Inject constructor(
    private val tus: TusUploadRepository,
) : CallRecordingUploader {
    override suspend fun upload(file: File, mimeType: String): Result<String> {
        val item = MediaUploadItem.onDisk(file, file.name, mimeType)
        return when (val result = tus.upload(item, TusUploadContext.ATTACHMENT)) {
            is NetworkResult.Failure -> Result.failure(IOException(result.error.message))
            is NetworkResult.Success -> result.data.firstOrNull()?.id
                ?.let { Result.success(it) }
                ?: Result.failure(IOException("call recording upload returned no attachment"))
        }
    }
}
