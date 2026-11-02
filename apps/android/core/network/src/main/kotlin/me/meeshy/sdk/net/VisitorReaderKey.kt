package me.meeshy.sdk.net

import java.util.UUID
import me.meeshy.sdk.model.security.SecureStore

/**
 * La cle d'un lecteur SANS compte : de quoi compter UNE vue par lecteur sans savoir qui il est
 * (miroir de `VisitorReaderKey` iOS). Un uuid aleatoire prefixe `visitor_`, tire une fois et
 * garde dans le coffre chiffre, sans lien avec l'appareil ni la personne. Il voyage en
 * `X-Session-Token` ; il est efface des qu'un compte se connecte ([EncryptedTokenStore]).
 */
interface VisitorReaderKeyProviding {
    /** La cle courante, tiree a la premiere lecture. */
    fun readerKey(): String

    /** La cle gardee, SANS en tirer une neuve : `null` apres une purge. */
    fun storedReaderKey(): String?

    /** Oublie la cle : la prochaine lecture en tire une neuve. */
    fun purge()
}

class VisitorReaderKey(
    private val store: SecureStore,
    private val newUuid: () -> String = { UUID.randomUUID().toString().lowercase() },
) : VisitorReaderKeyProviding {

    @Synchronized
    override fun readerKey(): String {
        storedReaderKey()?.let { return it }
        val fresh = PREFIX + newUuid()
        store.put(STORAGE_KEY, fresh)
        return fresh
    }

    @Synchronized
    override fun storedReaderKey(): String? = store.get(STORAGE_KEY)?.takeIf { it.startsWith(PREFIX) }

    @Synchronized
    override fun purge() = store.remove(STORAGE_KEY)

    companion object {
        const val PREFIX: String = "visitor_"
        const val STORAGE_KEY: String = "visitor_reader_key"
    }
}
