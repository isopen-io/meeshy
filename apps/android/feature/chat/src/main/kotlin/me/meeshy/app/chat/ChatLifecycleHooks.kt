package me.meeshy.app.chat

import kotlinx.coroutines.CancellationException

/**
 * Les crochets de sortie de l'écran (iOS `conversationDidEnterBackground` / `willResignActive`) : chaque sous-écran qui
 * doit se mettre à l'abri quand l'app quitte le premier plan (brouillon, enregistrement vocal vers le plateau)
 * s'inscrit ici, et l'écran les déclenche UNE fois à `ON_STOP`. Un crochet qui échoue n'empêche pas les suivants.
 */
class ChatLifecycleHooks {
    private val stopHooks = LinkedHashMap<String, () -> Unit>()

    /** Inscrit (ou remplace) le crochet de [key] ; rend le geste qui le retire. */
    fun onStop(key: String, hook: () -> Unit): () -> Unit {
        stopHooks[key] = hook
        return { stopHooks.remove(key) }
    }

    fun fireStop() {
        stopHooks.values.toList().forEach { hook ->
            try {
                hook()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }
}
