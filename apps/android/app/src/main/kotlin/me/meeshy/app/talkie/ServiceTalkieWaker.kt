package me.meeshy.app.talkie

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.relation.TalkieWakePush
import timber.log.Timber

/**
 * Réveille par le service au premier plan [TalkieWakeService] (type `mediaPlayback`, déjà déclaré). Un push FCM haute
 * priorité autorise le démarrage depuis l'arrière-plan ; si le système le refuse quand même, la notification est posée
 * seule — on voit « X vous parle », et la toucher ouvre l'app, qui rattrape la voix.
 */
@Singleton
class ServiceTalkieWaker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val state: TalkieWakeState,
) : TalkieWaker {

    override fun wake(push: TalkieWakePush) {
        state.wake(push)
        runCatching {
            ContextCompat.startForegroundService(context, Intent(context, TalkieWakeService::class.java))
        }.onFailure { failure ->
            Timber.w("Talkie wake service refused (%s): notification only", failure.javaClass.simpleName)
            post(push)
        }
    }

    override fun voiceLeft(push: TalkieWakePush) {
        if (!state.keep(push)) post(push)
    }

    private fun post(push: TalkieWakePush) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        runCatching { manager.notify(TalkieWakeNotification.NOTIFICATION_ID, TalkieWakeNotification.build(context, push)) }
            .onFailure { Timber.w("Talkie wake notification refused: %s", it.javaClass.simpleName) }
    }
}
