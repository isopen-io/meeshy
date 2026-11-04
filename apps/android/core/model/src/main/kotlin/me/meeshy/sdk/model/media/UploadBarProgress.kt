package me.meeshy.sdk.model.media

/** Où en est UN fichier de la barre d'envoi globale. */
public enum class UploadBarStatus { QUEUED, UPLOADING, COMPLETED, FAILED }

public data class UploadBarFile(
    val fileName: String,
    val sentBytes: Long,
    val totalBytes: Long,
    val status: UploadBarStatus,
)

/**
 * Ce que la barre de progression GLOBALE de l'envoi montre (iOS `UploadQueueProgress` + `UploadProgressBar`) : un pourcentage
 * sur tous les octets annoncés, le fichier en cours, « x/y fichiers ». Pure : l'écran n'en est que la projection.
 */
public data class UploadBarProgress(val files: List<UploadBarFile>) {
    val totalFiles: Int get() = files.size

    val completedFiles: Int get() = files.count { it.status == UploadBarStatus.COMPLETED }

    val uploadedBytes: Long get() = files.sumOf { if (it.status == UploadBarStatus.COMPLETED) it.totalBytes else it.sentBytes.coerceIn(0L, it.totalBytes) }

    val totalBytes: Long get() = files.sumOf { it.totalBytes }

    /** Le premier fichier réellement en envoi ; `null` quand rien ne monte (tout attend, ou tout est fini). */
    val currentFileName: String? get() = files.firstOrNull { it.status == UploadBarStatus.UPLOADING }?.fileName

    /** 0..100 sur les octets ; sans octet annoncé, sur les fichiers terminés. Jamais au-delà de 100. */
    val percentage: Int
        get() = when {
            files.isEmpty() -> 0
            totalBytes > 0L -> (uploadedBytes * PERCENT / totalBytes).toInt().coerceIn(0, PERCENT)
            else -> completedFiles * PERCENT / totalFiles
        }

    /** L'icône fait un tour complet à 100 %. */
    val isComplete: Boolean get() = percentage >= PERCENT

    /** La barre a quelque chose à dire : au moins un fichier. */
    val isVisible: Boolean get() = files.isNotEmpty()

    private companion object {
        const val PERCENT = 100
    }
}
