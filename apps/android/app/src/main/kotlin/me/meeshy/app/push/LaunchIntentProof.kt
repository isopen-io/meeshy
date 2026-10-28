package me.meeshy.app.push

import android.content.Context
import android.content.Intent
import android.util.Base64
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **La preuve qu'un intent d'appel a été fabriqué par Meeshy** (#13504).
 *
 * `MainActivity` est exportée : n'importe quelle app installée peut lui envoyer un intent EXPLICITE portant les extras
 * du push d'appel. Seul le processus Meeshy connaît le secret de cette installation (32 octets de [SecureRandom], en
 * stockage privé, hors sauvegarde : `allowBackup="false"`) : [stamp] pose dans [EXTRA_PROOF] un HMAC-SHA256 des extras
 * d'appel (identifiant, conversation, nom affiché, vidéo, décroché auto), [admits] le recalcule et le compare en temps
 * constant. Le secret survit à la mort du processus, donc une notification posée avant reste valable ; une preuve ne
 * vaut que pour les valeurs qu'elle signe — elle ne transforme pas une sonnerie en décroché, ni un appel en un autre.
 */
@Singleton
class LaunchIntentProof @Inject constructor(@ApplicationContext private val context: Context) {

    private val key: ByteArray by lazy(::loadOrCreateKey)

    fun stamp(intent: Intent): Intent = intent.putExtra(EXTRA_PROOF, signature(intent))

    fun admits(intent: Intent): Boolean {
        val presented = runCatching { intent.getStringExtra(EXTRA_PROOF) }.getOrNull() ?: return false
        val expected = runCatching { signature(intent) }.getOrNull() ?: return false
        return MessageDigest.isEqual(presented.toByteArray(Charsets.US_ASCII), expected.toByteArray(Charsets.US_ASCII))
    }

    private fun signature(intent: Intent): String {
        val mac = Mac.getInstance(ALGORITHM).apply { init(SecretKeySpec(key, ALGORITHM)) }
        return Base64.encodeToString(mac.doFinal(canonical(intent).toByteArray(Charsets.UTF_8)), Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)
    }

    private fun canonical(intent: Intent): String = listOf(
        intent.getStringExtra(MeeshyFcmService.EXTRA_CALL_ID).field(),
        intent.getStringExtra(MeeshyFcmService.EXTRA_CONVERSATION_ID).field(),
        intent.getStringExtra(MeeshyFcmService.EXTRA_CALLER_NAME).field(),
        intent.getBooleanExtra(MeeshyFcmService.EXTRA_IS_VIDEO, false).toString(),
        intent.getBooleanExtra(MeeshyFcmService.EXTRA_AUTO_ANSWER, false).toString(),
    ).joinToString(separator = FIELD_SEPARATOR)

    private fun String?.field(): String = this?.let { "+${it.length}:$it" } ?: "-"

    @Synchronized
    private fun loadOrCreateKey(): ByteArray {
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        preferences.getString(KEY_SECRET, null)
            ?.let { runCatching { Base64.decode(it, Base64.NO_WRAP) }.getOrNull() }
            ?.takeIf { it.size == SECRET_BYTES }
            ?.let { return it }
        val secret = ByteArray(SECRET_BYTES).also(SecureRandom()::nextBytes)
        preferences.edit().putString(KEY_SECRET, Base64.encodeToString(secret, Base64.NO_WRAP)).commit()
        return secret
    }

    companion object {
        const val EXTRA_PROOF = "me.meeshy.app.extra.LAUNCH_PROOF"
        private const val ALGORITHM = "HmacSHA256"
        private const val PREFERENCES = "meeshy.launch_proof"
        private const val KEY_SECRET = "secret"
        private const val SECRET_BYTES = 32
        private const val FIELD_SEPARATOR = "\u0000"
    }
}
