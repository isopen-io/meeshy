package me.meeshy.app.startup

import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import timber.log.Timber

/**
 * Une tache de demarrage de l'application, contribuee en `@IntoSet` depuis le module du
 * lot qui la possede : `MeeshyApplication` ne se modifie plus pour en ajouter une.
 *
 * Executee UNE fois, sur le thread principal, dans `Application.onCreate` : une
 * initialisation lourde doit se deleguer a un scope (jamais bloquer ici). Une exception
 * levee par [initialize] est journalisee et n'empeche NI les suivantes NI le demarrage.
 */
interface AppInitializer {
    /** Ordre croissant ; a egalite, l'ordre alphabetique de [name] rend l'execution deterministe. */
    val priority: Int get() = 0

    val name: String get() = javaClass.name

    fun initialize()
}

@Singleton
class AppInitializerRunner @Inject constructor(
    private val initializers: Set<@JvmSuppressWildcards AppInitializer>,
) {
    private val started = AtomicBoolean(false)

    fun runAll() {
        if (!started.compareAndSet(false, true)) return
        initializers
            .sortedWith(compareBy<AppInitializer> { it.priority }.thenBy { it.name })
            .forEach { initializer ->
                try {
                    initializer.initialize()
                } catch (failure: Exception) {
                    Timber.e(failure, "AppInitializer %s a echoue", initializer.name)
                }
            }
    }
}
