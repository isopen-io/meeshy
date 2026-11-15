package me.meeshy.sdk.lifecycle

import me.meeshy.sdk.model.lifecycle.TrimLevel

/**
 * Point d'extension du cycle de vie du process, contribue en `@IntoSet` : un service de
 * persistance s'y enregistre sans editer `MeeshyApplication`. Toutes les methodes sont
 * executees hors du fil principal, l'une apres l'autre ; une exception est journalisee.
 */
interface AppLifecycleHook {
    /** Ordre croissant ; a egalite, ordre alphabetique de [name]. */
    val priority: Int get() = 0

    val name: String get() = javaClass.name

    suspend fun onAppCreate() = Unit

    /** ON_START apres un passage en arriere-plan (et au premier demarrage). */
    suspend fun onForeground() = Unit

    /** ON_STOP du process. */
    suspend fun onBackground() = Unit

    suspend fun onTrimMemory(level: TrimLevel) = Unit
}
