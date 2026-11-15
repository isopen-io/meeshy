package me.meeshy.app.push

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject

/**
 * À la déconnexion, les bannières du compte quitté s'en vont : leur texte, leur expéditeur et leurs
 * boutons « Répondre » / « Marquer comme lu » ne survivent pas au compte suivant (#13394).
 */
class PostedNotificationsTeardown @Inject constructor(
    @ApplicationContext private val context: Context,
) : PerAccountCache {
    override suspend fun clear() {
        NotificationManagerCompat.from(context).cancelAll()
    }
}
