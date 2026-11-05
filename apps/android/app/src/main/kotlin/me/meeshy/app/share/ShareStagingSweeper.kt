package me.meeshy.app.share

import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.sync.Mutex

/**
 * **Le nom d'une copie anticipée** : `share-<partage>-<rang>.<extension sûre>`, à plat dans le cache d'entrée des médias
 * ([me.meeshy.sdk.media.MediaIntake.DIRECTORY]). C'est ce dossier que la feuille libère après l'envoi
 * ([me.meeshy.sdk.media.MediaIntake.release]), que le système peut vider, et que la déconnexion vide
 * ([me.meeshy.sdk.media.MediaIntakeTeardown]). Le préfixe distingue nos copies de celles du composeur, nommées par un UUID.
 */
object ShareStagingNames {
    private const val PREFIX = "share-"
    private val UNSAFE = Regex("[^A-Za-z0-9_-]")

    fun fileName(shareId: String, index: Int, ext: String): String = "$PREFIX${safe(shareId)}-$index.$ext"

    /** Le partage auquel appartient la copie [fileName], ou `null` si ce n'est pas une copie de partage. */
    fun shareIdOf(fileName: String): String? {
        if (!fileName.startsWith(PREFIX)) return null
        return fileName.removePrefix(PREFIX).substringBeforeLast('.').substringBeforeLast('-', "").takeIf { it.isNotEmpty() }
    }

    fun safe(shareId: String): String = shareId.replace(UNSAFE, "_")
}

/**
 * **Les partages ouverts dans ce processus.** Une copie dont le partage n'est plus ouvert n'est plus lue par personne :
 * elle part au prochain balayage. [copying] sérialise les copies : chaque partage connaît exactement ce que les autres
 * tiennent avant de copier, et le plafond global ([me.meeshy.sdk.model.share.ShareStagingPolicy.MAX_STAGED_BYTES]) tient
 * même quand une app relance l'activité en boucle.
 */
object ShareStagingRegistry {
    private val open = ConcurrentHashMap.newKeySet<String>()
    val copying: Mutex = Mutex()

    fun open(shareId: String) {
        open += ShareStagingNames.safe(shareId)
    }

    fun close(shareId: String) {
        open -= ShareStagingNames.safe(shareId)
    }

    fun isOpen(shareId: String): Boolean = shareId in open
}

/**
 * **Le ménage des copies anticipées.** Aucune ne survit à son partage : [sweep] efface celles d'un partage qui n'est plus
 * ouvert (processus tué, activité détruite), [discard] celles d'un partage fermé sans envoi, et [bytesHeldByOthers] dit ce
 * que tiennent les autres partages ouverts, pour borner le suivant.
 */
class ShareStagingSweeper(
    private val directory: () -> File,
    private val isOpen: (shareId: String) -> Boolean,
) {
    /** Rend le nombre de copies effacées. */
    fun sweep(): Int = copies().filterNot { (id, _) -> isOpen(id) }.count { (_, file) -> file.delete() }

    fun bytesHeldByOthers(shareId: String): Long {
        val me = ShareStagingNames.safe(shareId)
        return copies().filter { (id, _) -> id != me && isOpen(id) }.sumOf { (_, file) -> file.length() }
    }

    /** Rend le nombre de copies effacées. */
    fun discard(shareId: String): Int {
        val me = ShareStagingNames.safe(shareId)
        return copies().filter { (id, _) -> id == me }.count { (_, file) -> file.delete() }
    }

    private fun copies(): List<Pair<String, File>> =
        directory().listFiles().orEmpty()
            .filter { it.isFile }
            .mapNotNull { file -> ShareStagingNames.shareIdOf(file.name)?.let { it to file } }
}
