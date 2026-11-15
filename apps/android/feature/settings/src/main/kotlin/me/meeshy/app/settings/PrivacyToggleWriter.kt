package me.meeshy.app.settings

import androidx.work.WorkManager
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.PrivacyCatalog
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.PrivacyToggle
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.privacy.AnalyticsCollectionGate
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesSyncRepository

/**
 * L'écrivain UNIQUE d'un interrupteur de confidentialité, partagé par Réglages › Confidentialité et Réglages ›
 * Médias (« Enregistrer dans la galerie », #14640) : le magasin de l'appareil d'abord (repeint instantané), puis la
 * synchronisation durable vers la passerelle (`PATCH /me/preferences/privacy`), l'outbox n'étant réveillée que si
 * une ligne a vraiment été mise en file. Reposer un interrupteur sur sa valeur n'écrit rien.
 */
class PrivacyToggleWriter @Inject constructor(
    private val store: PrivacyPreferencesStore,
    private val syncRepository: PrivacyPreferencesSyncRepository,
    private val workManager: WorkManager,
    private val analyticsGate: AnalyticsCollectionGate,
) {
    val preferences: StateFlow<PrivacyPreferences> get() = store.preferences

    suspend fun set(toggle: PrivacyToggle, enabled: Boolean) {
        if (!PrivacyCatalog.isWritable(toggle)) return
        val current = store.preferences.value
        if (PrivacyCatalog.isEnabled(current, toggle) == enabled) return
        val updated = PrivacyCatalog.set(current, toggle, enabled)
        store.setPreferences(updated)
        if (toggle == PrivacyToggle.ALLOW_ANALYTICS) analyticsGate.onAnalyticsConsentChanged(enabled)
        val cmid = syncRepository.enqueueSync(updated)
        if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
    }
}
