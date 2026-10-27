package me.meeshy.app.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import timber.log.Timber

/**
 * Le point unique de repeinte des quatre widgets (pendant de `WidgetRefresher.refreshAll` de la
 * coque `apps/web/android`). [request] dit « quelque chose a changé hors du cache » (langue du
 * lecteur, thème) ; [repaintAll] redessine, chaque widget isolé des échecs des autres.
 */
@Singleton
class WidgetRefresher @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val requestSignal = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    internal val requests: Flow<Unit> get() = requestSignal

    fun request() {
        requestSignal.tryEmit(Unit)
    }

    suspend fun repaintAll() {
        repaint { UnreadCountWidget().updateAll(context) }
        repaint { RecentConversationsWidget().updateAll(context) }
        repaint { FavoriteContactsWidget().updateAll(context) }
        repaint { QuickReplyWidget().updateAll(context) }
    }

    private suspend fun repaint(widget: suspend () -> Unit) {
        try {
            widget()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "repeinte d'un widget échouée")
        }
    }
}
