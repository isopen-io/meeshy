package me.meeshy.app.settings

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Pose les octets d'un échantillon dans un fichier temporaire du cache : l'envoi passe par un multipart sur fichier, jamais en mémoire. */
open class VoiceSampleFiles @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    open suspend fun write(bytes: ByteArray): File = withContext(Dispatchers.IO) {
        File.createTempFile("voice-sample-", ".m4a", context.cacheDir).apply { writeBytes(bytes) }
    }

    open suspend fun discard(file: File) {
        withContext(Dispatchers.IO) { file.delete() }
    }
}
