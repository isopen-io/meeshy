package me.meeshy.app.inactivity

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.MessageNotificationId
import me.meeshy.app.push.PushActionProvider
import me.meeshy.sdk.inactivity.WellnessReporting
import me.meeshy.sdk.model.inactivity.InactivityContract
import me.meeshy.sdk.model.push.PushPayload
import me.meeshy.ui.R

/** Qui porte « Je vais bien » : la question « Tout va bien ? », et elle seule. */
object WellnessActionPlan {
    fun offersAction(payload: PushPayload): Boolean = InactivityContract.answersWellness(payload)
}

/**
 * Le bouton « Je vais bien » de la bannière « Tout va bien ? » (#18738), contribué au pipeline par le point
 * d'extension [PushActionProvider]. Le `PendingIntent` est IMMUABLE et vise un récepteur NON exporté : il ne porte que
 * l'index de la bannière à retirer, jamais une cible à croire.
 */
class WellnessActionProvider @Inject constructor(@ApplicationContext private val context: Context) : PushActionProvider {
    override fun actions(push: IncomingPush): List<NotificationCompat.Action> {
        val payload = push.payload
        if (!WellnessActionPlan.offersAction(payload)) return emptyList()
        val bannerId = MessageNotificationId.of(payload.type, payload.conversationId, payload.notificationId)
        val intent = Intent(context, WellnessOkReceiver::class.java)
            .setAction(WellnessOkReceiver.ACTION_WELLNESS_OK)
            .putExtra(WellnessOkReceiver.EXTRA_BANNER_ID, bannerId)
        val pending = PendingIntent.getBroadcast(
            context,
            ("wellness-ok:$bannerId").hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return listOf(NotificationCompat.Action.Builder(0, context.getString(R.string.inactivity_wellness_ok), pending).build())
    }
}

/**
 * « Je vais bien » : `POST /me/wellness/ok`, puis la bannière se retire. Un récepteur, pas une activité : rien ne
 * s'ouvre. Sans réseau, la bannière reste — le prochain geste (ou l'app ouverte, qui est une activité) répondra.
 */
@AndroidEntryPoint
class WellnessOkReceiver : BroadcastReceiver() {

    @Inject
    lateinit var reporter: WellnessReporting

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_WELLNESS_OK) return
        val bannerId = intent.getIntExtra(EXTRA_BANNER_ID, 0)
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val answered = withTimeoutOrNull(ANSWER_BUDGET_MS) { reporter.reportOk() } == true
                if (answered) {
                    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(bannerId)
                }
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION_WELLNESS_OK = "me.meeshy.app.inactivity.action.WELLNESS_OK"
        const val EXTRA_BANNER_ID = "bannerId"
        private const val ANSWER_BUDGET_MS = 8_000L
    }
}

/**
 * Le toucher de « Tout va bien ? » ouvre l'app — c'est déjà une activité, que la socket du téléphone suivi porte — et
 * répond aussi explicitement, sans attendre la socket.
 */
class WellnessTapAnswer @Inject constructor(private val reporter: WellnessReporting) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun onTap(payload: PushPayload) {
        if (!InactivityContract.answersWellness(payload)) return
        scope.launch { runCatching { withTimeoutOrNull(ANSWER_BUDGET_MS) { reporter.reportOk() } } }
    }

    private companion object {
        const val ANSWER_BUDGET_MS = 8_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface WellnessActionModule {
    @Binds
    @IntoSet
    fun bindWellnessAction(provider: WellnessActionProvider): PushActionProvider
}
