package me.meeshy.sdk.auth

import android.content.Context
import android.content.SharedPreferences
import me.meeshy.sdk.model.auth.ReferralCode

/**
 * Le code d'invitation, entre l'ouverture du lien (`/signup/affiliate/<code>`, `/signup?ref=`) et
 * l'inscription. Quelqu'un ouvre une invitation puis s'inscrit parfois le lendemain : le code
 * survit au relancement et périt après trente jours, comme sur iOS et le web.
 */
public interface PendingReferralStore {
    /** Mémorise un code bien formé ; un code mal formé n'efface RIEN. */
    public fun remember(code: String)

    /** Le code mémorisé et non expiré, ou `null`. */
    public fun recall(): String?

    /** Oublie le code — une fois le compte créé (usage unique). */
    public fun forget()
}

/** [PendingReferralStore] volatil — tests et aperçus. */
public class InMemoryPendingReferralStore(
    private val timeToLiveMillis: Long = PendingReferralTtl.DEFAULT_MILLIS,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : PendingReferralStore {
    private var remembered: Pair<String, Long>? = null

    override fun remember(code: String) {
        remembered = ReferralCode.normalized(code)?.let { it to nowMillis() } ?: return
    }

    override fun recall(): String? {
        val (code, savedAt) = remembered ?: return null
        if (nowMillis() - savedAt > timeToLiveMillis) {
            forget()
            return null
        }
        return code
    }

    override fun forget() {
        remembered = null
    }
}

public object PendingReferralTtl {
    /** Trente jours (`REFERRAL_MEMORY_TTL_MS`). */
    public const val DEFAULT_MILLIS: Long = 30L * 24 * 3600 * 1000
}

/** [PendingReferralStore] durable (SharedPreferences) : un code et son horodatage. */
public class SharedPrefsPendingReferralStore(
    context: Context,
    private val timeToLiveMillis: Long = PendingReferralTtl.DEFAULT_MILLIS,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : PendingReferralStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun remember(code: String) {
        val normalized = ReferralCode.normalized(code) ?: return
        prefs.edit().putString(KEY_CODE, normalized).putLong(KEY_SAVED_AT, nowMillis()).apply()
    }

    override fun recall(): String? {
        val code = prefs.getString(KEY_CODE, null) ?: return null
        if (nowMillis() - prefs.getLong(KEY_SAVED_AT, 0L) > timeToLiveMillis) {
            forget()
            return null
        }
        return ReferralCode.normalized(code)
    }

    override fun forget() {
        prefs.edit().remove(KEY_CODE).remove(KEY_SAVED_AT).apply()
    }

    public companion object {
        public const val FILE_NAME: String = "meeshy_pending_referral"
        private const val KEY_CODE = "code"
        private const val KEY_SAVED_AT = "savedAt"
    }
}
