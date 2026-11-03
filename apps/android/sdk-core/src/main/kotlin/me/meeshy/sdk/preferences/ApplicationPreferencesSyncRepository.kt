package me.meeshy.sdk.preferences

import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.ApplicationPreferenceSyncBody
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Synchronisation durable du thème (`PATCH /me/preferences/application`). Le `ThemeStore` local reste
 * la source de vérité de l'écran (le thème se peint à l'instant) ; ce dépôt ne met en file que le
 * dernier choix, sur la voie des réglages, sous un [OutboxKind] distinct des autres blocs : une rafale
 * hors ligne se réduit à un seul PATCH et ne supplante ni la confidentialité ni les notifications.
 * Le corps ne porte que le thème ([ApplicationPreferenceSyncBody]) : jamais de consentement ni de
 * langue d'interface. Inerte sans session (rend `null`, rien n'est écrit).
 */
@Singleton
public class ApplicationPreferencesSyncRepository @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val outboxRepository: OutboxRepository,
) {
    /** @return le `cmid` de la ligne mise en file, ou `null` hors session ou si elle a été supplantée. */
    public suspend fun enqueueTheme(theme: AppThemeMode): String? {
        val userId = sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_APPLICATION_SETTINGS,
                lane = OutboxLanes.SETTINGS,
                targetId = userId,
                payload = MeeshyApi.json.encodeToString(ApplicationPreferenceSyncBody.from(theme)),
            ),
        )
    }
}
