package me.meeshy.sdk.battery

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
 * « Partager ma batterie avec ce Proche ? » ne se propose qu'UNE fois (#14147). La route des réglages ne distingue pas
 * « jamais demandé » de « refusé » : la trace vit donc sur l'appareil, par compte et par personne.
 */
interface BatteryConsentLedger {
    fun wasOffered(userId: String): Boolean

    fun markOffered(userId: String)
}

/** Le stockage clé → présence, isolé pour les tests. */
interface BatteryConsentStorage {
    fun contains(key: String): Boolean

    fun put(key: String)
}

class SharedPrefsBatteryConsentStorage(context: Context) : BatteryConsentStorage {
    private val prefs = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun contains(key: String): Boolean = prefs.getBoolean(key, false)

    override fun put(key: String) {
        prefs.edit().putBoolean(key, true).apply()
    }

    private companion object {
        const val FILE_NAME = "meeshy_battery_consent"
    }
}

class StoredBatteryConsentLedger internal constructor(
    private val storage: BatteryConsentStorage,
    private val viewerId: () -> String?,
) : BatteryConsentLedger {

    @Inject
    constructor(@ApplicationContext context: Context, sessionRepository: SessionRepository) :
        this(SharedPrefsBatteryConsentStorage(context), { sessionRepository.currentUserId })

    /** Sans session, on tient la proposition pour faite : rien ne s'offre à un compte inconnu. */
    override fun wasOffered(userId: String): Boolean = keyOf(userId)?.let(storage::contains) ?: true

    override fun markOffered(userId: String) {
        keyOf(userId)?.let(storage::put)
    }

    private fun keyOf(userId: String): String? = viewerId()?.let { "$it:$userId" }
}

/**
 * Les annonces d'un push `device_battery` reçu app ouverte : la SyncPill les rend À LA PLACE de la bannière, sans
 * doublon. [id] est celui de la notification, pour qu'un même push ne défile qu'une fois.
 */
data class BatteryForegroundNotice(val id: String, val label: String)

@Singleton
class BatteryForegroundNotices @Inject constructor() {
    private val _notices = MutableSharedFlow<BatteryForegroundNotice>(extraBufferCapacity = 16)
    val notices: SharedFlow<BatteryForegroundNotice> = _notices.asSharedFlow()

    /** Rend `false` quand personne n'écoute (aucune pastille montée) : la bannière doit alors partir. */
    fun offer(notice: BatteryForegroundNotice): Boolean =
        _notices.subscriptionCount.value > 0 && _notices.tryEmit(notice)
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BatteryConsentModule {
    @Binds
    fun bindLedger(ledger: StoredBatteryConsentLedger): BatteryConsentLedger
}
