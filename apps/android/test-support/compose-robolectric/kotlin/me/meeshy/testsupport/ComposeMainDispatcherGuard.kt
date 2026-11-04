package me.meeshy.testsupport

import android.os.Looper
import androidx.compose.ui.platform.AndroidUiDispatcher
import kotlin.coroutines.ContinuationInterceptor
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CoroutineDispatcher
import org.robolectric.Shadows.shadowOf
import org.robolectric.pluginapi.TestEnvironmentLifecyclePlugin

/**
 * La garde de #15815, posée avant chaque témoin Robolectric du module : `AndroidUiDispatcher.Main`, dès qu'un témoin
 * précédent l'a créé, doit encore exécuter ce qu'on lui confie.
 *
 * Une écriture d'état Compose faite hors de toute composition (un détenteur d'état piloté sans `setContent`) réveille
 * `GlobalSnapshotManager`, qui poste son application sur la boucle principale. Si le témoin s'achève sans vider cette
 * boucle, Robolectric efface le message au démontage : le répartiteur reste « programmé » pour toute la JVM, plus
 * aucune écriture globale n'est appliquée, et chaque témoin Compose suivant attend 60 s puis tombe en
 * `AppNotIdleException` au premier `setContent`.
 *
 * Plutôt qu'une cascade d'une heure loin de sa cause, la garde fait échouer tout de suite, avec ce message, les
 * témoins qui suivent la fuite. Le coupable est celui qui précède le premier échec dans la même JVM ; il se corrige
 * en vidant la boucle principale après ses écritures (`shadowOf(Looper.getMainLooper()).idle()` dans un `@After`).
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
        var ran = false
        dispatcher.dispatch(context) { ran = true }
        shadowOf(mainLooper).idle()
        check(ran) { LEAK }
    }

    private fun createdMainDispatcher(): CoroutineContext? {
        val main = AndroidUiDispatcher::class.java.getDeclaredField(MAIN_DELEGATE)
            .apply { isAccessible = true }
            .get(null) as Lazy<*>
        return if (main.isInitialized()) main.value as CoroutineContext else null
    }

    private companion object {
        const val MAIN_DELEGATE: String = "Main\$delegate"

        const val LEAK: String =
            "AndroidUiDispatcher.Main n'exécute plus rien : un témoin qui a précédé celui-ci dans la même JVM a écrit " +
                "un état Compose hors composition sans vider la boucle principale, et Robolectric a effacé " +
                "l'application en attente de GlobalSnapshotManager. Videz la boucle après ses écritures " +
                "(@After : shadowOf(Looper.getMainLooper()).idle()). Voir #15815."
    }
}
