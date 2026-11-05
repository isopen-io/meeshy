package me.meeshy.testsupport

import android.os.Looper
import androidx.compose.ui.platform.AndroidUiDispatcher
import kotlin.coroutines.ContinuationInterceptor
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CoroutineDispatcher
import org.robolectric.Shadows.shadowOf
import org.robolectric.pluginapi.TestEnvironmentLifecyclePlugin

/**
 * La garde de #15815, posée avant chaque témoin Robolectric des modules Compose : `AndroidUiDispatcher.Main`, dès
 * qu'un témoin précédent l'a créé, doit encore exécuter ce qu'on lui confie.
 *
 * Une écriture d'état Compose faite hors de toute composition (un détenteur d'état piloté sans `setContent`), ou un
 * chargement qui reprend sur le fil principal après le démontage, poste sur la boucle principale. Si le témoin
 * s'achève sans vider cette boucle, Robolectric efface le message au démontage : le répartiteur reste « programmé »
 * pour toute la JVM, plus aucune écriture globale n'est appliquée, et chaque témoin Compose suivant attend 60 s puis
 * tombe en `AppNotIdleException` au premier `setContent` — une cascade d'une heure loin de sa cause.
 *
 * La garde RÉPARE : le message effacé est la seule chose perdue, la file du répartiteur est intacte. Elle lève donc
 * les deux drapeaux « déjà programmé » et redemande une distribution, qui exécute la file en attente. Le témoin
 * suivant part d'une boucle saine, et la fuite est nommée sur la sortie d'erreur pour que son auteur la vide
 * (`@After : shadowOf(Looper.getMainLooper()).idle()`). Si la réparation échoue, le témoin échoue tout de suite avec
 * ce même message plutôt que d'attendre 60 s.
 *
 * Le répartiteur n'est jamais créé ici : avant la mise en place du témoin, l'affichage simulé n'existe pas encore et
 * `Choreographer` ne se construit pas.
 */
public class ComposeMainDispatcherGuard : TestEnvironmentLifecyclePlugin {

    override fun onSetupApplicationState() {
        val mainLooper = Looper.getMainLooper() ?: return
        if (Looper.myLooper() !== mainLooper) return
        val context = createdMainDispatcher() ?: return
        val dispatcher = context[ContinuationInterceptor] as CoroutineDispatcher
        if (runs(dispatcher, context, mainLooper)) return
        System.err.println("ComposeMainDispatcherGuard : $LEAK La garde a relancé le répartiteur.")
        clearScheduledFlags(dispatcher)
        check(runs(dispatcher, context, mainLooper)) { LEAK }
    }

    private fun runs(dispatcher: CoroutineDispatcher, context: CoroutineContext, mainLooper: Looper): Boolean {
        var ran = false
        dispatcher.dispatch(context) { ran = true }
        shadowOf(mainLooper).idle()
        return ran
    }

    private fun clearScheduledFlags(dispatcher: CoroutineDispatcher) {
        SCHEDULED_FLAGS.forEach { name ->
            runCatching {
                AndroidUiDispatcher::class.java.getDeclaredField(name)
                    .apply { isAccessible = true }
                    .setBoolean(dispatcher, false)
            }
        }
    }

    private fun createdMainDispatcher(): CoroutineContext? {
        val main = AndroidUiDispatcher::class.java.getDeclaredField(MAIN_DELEGATE)
            .apply { isAccessible = true }
            .get(null) as Lazy<*>
        return if (main.isInitialized()) main.value as CoroutineContext else null
    }

    private companion object {
        const val MAIN_DELEGATE: String = "Main\$delegate"

        val SCHEDULED_FLAGS: List<String> = listOf("scheduledTrampolineDispatch", "scheduledFrameDispatch")

        const val LEAK: String =
            "AndroidUiDispatcher.Main n'exécutait plus rien : un témoin qui a précédé celui-ci dans la même JVM a " +
                "laissé un message sur la boucle principale, et Robolectric l'a effacé au démontage. Videz la boucle " +
                "après ses écritures (@After : shadowOf(Looper.getMainLooper()).idle()). Voir #15815."
    }
}
