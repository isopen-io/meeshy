package me.meeshy.sdk.post

import android.content.Context
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import dagger.hilt.android.qualifiers.ApplicationContext

/**
 * Les fichiers des commentaires en attente, cloisonnés par compte sous `pending-media/comments-<compte>/` (iOS
 * `OfflineQueue.pendingMediaDirectoryName` + `CommentOwnership.ownedMediaPaths`). Un chemin gravé sur une ligne est RELATIF
 * à ce dossier ; il n'est lu que s'il vit dans le dossier de son AUTEUR : un chemin absolu, un `..`, ou le dossier d'un
 * autre compte ne mène à aucun fichier.
 */
@Singleton
public class CommentMediaFiles @Inject constructor(@ApplicationContext context: Context) {
    private val root = File(context.filesDir, ROOT_NAME)

    /** Le fichier que [relativePath] désigne pour [ownerId], ou `null` s'il n'est pas dans le dossier de son auteur. */
    public fun resolve(ownerId: String?, relativePath: String): File? = resolveIn(root, ownerId, relativePath)

    /** Retire les fichiers de [relativePaths] (la création a abouti, ou la ligne est retirée). */
    public fun discard(ownerId: String?, relativePaths: List<String>) {
        relativePaths.forEach { path -> resolve(ownerId, path)?.delete() }
    }

    /** Le dossier (relatif) où ranger les pièces d'un commentaire de [ownerId] ; `null` sans compte utilisable. */
    public fun relativeFolder(ownerId: String?): String? = folderName(ownerId)

    public companion object {
        public const val ROOT_NAME: String = "pending-media"

        internal fun folderName(ownerId: String?): String? {
            val owner = ownerId?.trim().orEmpty()
            val safe = owner.filter { it.isLetterOrDigit() }
            return if (safe.isEmpty()) null else "comments-$safe"
        }

        internal fun resolveIn(root: File, ownerId: String?, relativePath: String): File? {
            val folder = folderName(ownerId) ?: return null
            val segments = relativePath.split('/')
            val owned = segments.size >= 2 && segments.first() == folder && segments.none { it == ".." || it.isEmpty() }
            return if (owned) File(root, relativePath) else null
        }
    }
}
