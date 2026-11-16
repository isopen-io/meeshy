package me.meeshy.sdk.phonereachability

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.session.SessionRepository

/**
 * « Prévenir ce Proche si mon téléphone est injoignable ? » ne se propose qu'UNE fois (#18737). La route des réglages
 * ne distingue pas « jamais demandé » de « refusé » : la trace vit donc sur l'appareil, par compte et par personne.
 */
interface PhoneReachabilityConsentLedger {
    fun wasOffered(userId: String): Boolean

    fun markOffered(userId: String)
}

/** Le stockage clé → présence, isolé pour les tests. */
interface PhoneReachabilityConsentStorage {
    fun contains(key: String): Boolean

    fun put(key: String)
}

class SharedPrefsPhoneReachabilityConsentStorage(context: Context) : PhoneReachabilityConsentStorage {
    private val prefs = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun contains(key: String): Boolean = prefs.getBoolean(key, false)

    override fun put(key: String) {
        prefs.edit().putBoolean(key, true).apply()
    }

    private companion object {
        const val FILE_NAME = "meeshy_phone_reachability_consent"
    }
}

class StoredPhoneReachabilityConsentLedger internal constructor(
    private val storage: PhoneReachabilityConsentStorage,
    private val viewerId: () -> String?,
) : PhoneReachabilityConsentLedger {

    @Inject
    constructor(@ApplicationContext context: Context, sessionRepository: SessionRepository) :
        this(SharedPrefsPhoneReachabilityConsentStorage(context), { sessionRepository.currentUserId })

    /** Sans session, on tient la proposition pour faite : rien ne s'offre à un compte inconnu. */
    override fun wasOffered(userId: String): Boolean = keyOf(userId)?.let(storage::contains) ?: true

    override fun markOffered(userId: String) {
        keyOf(userId)?.let(storage::put)
    }

    private fun keyOf(userId: String): String? = viewerId()?.let { "$it:$userId" }
}

/**
 * Les annonces d'un push `device_unreachable` reçu app ouverte : la SyncPill les rend À LA PLACE de la bannière, sans
 * doublon. [id] est celui de la notification, pour qu'un même push ne défile qu'une fois.
 */
data class PhoneReachabilityForegroundNotice(val id: String, val label: String)

@Singleton
class PhoneReachabilityForegroundNotices @Inject constructor() {
    private val _notices = MutableSharedFlow<PhoneReachabilityForegroundNotice>(extraBufferCapacity = 16)
    val notices: SharedFlow<PhoneReachabilityForegroundNotice> = _notices.asSharedFlow()

    /** Rend `false` quand personne n'écoute (aucune pastille montée) : la bannière doit alors partir. */
    fun offer(notice: PhoneReachabilityForegroundNotice): Boolean =
        _notices.subscriptionCount.value > 0 && _notices.tryEmit(notice)
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneReachabilityConsentModule {
    @Binds
    fun bindLedger(ledger: StoredPhoneReachabilityConsentLedger): PhoneReachabilityConsentLedger
}
