package me.meeshy.app.session

import com.google.common.truth.Truth.assertThat
import dagger.Component
import dagger.Module
import me.meeshy.sdk.session.PerAccountCache
import org.junit.Test
import java.lang.reflect.ParameterizedType

/**
 * Le branchement de la carte de présence dans la déconnexion (#13774), lu dans le graphe que Hilt a
 * RÉELLEMENT généré pour l'application, pas dans le module seul : le composant racine installe le
 * module de la carte, et la classe qui assemble le `Set<PerAccountCache>` vidé par `SessionTeardown.wipe`
 * appelle la contribution de la carte. Retirer `@IntoSet`, `@InstallIn` ou le module fait tomber ce témoin.
 */
class PresenceTeardownGraphTest {

    private val rootComponent = "me.meeshy.app.MeeshyApplication_HiltComponents\$SingletonC"
    private val generatedGraph = "me.meeshy.app.DaggerMeeshyApplication_HiltComponents_SingletonC"
    private val presenceModule = "me.meeshy.sdk.socket.PresenceMapPersistenceModule"
    private val presenceContribution = "me/meeshy/sdk/socket/PresenceMapPersistenceModule_ProvidePresenceAccountCacheFactory"

    @Test
    fun `the application singleton graph installs the presence map module`() {
        val installed = Class.forName(rootComponent).getAnnotation(Component::class.java).modules.map { it.java }

        assertThat(installed.flatMap(::withIncludes).map { it.name }).contains(presenceModule)
    }

    /** Un module `internal` est installé par l'enveloppe publique que Hilt génère (`HiltWrapper_…`), qui l'inclut. */
    private fun withIncludes(module: Class<*>): List<Class<*>> =
        listOf(module) + module.getAnnotation(Module::class.java)?.includes.orEmpty().map { it.java }.flatMap(::withIncludes)

    @Test
    fun `the set of per-account caches the session teardown empties is assembled with the presence map`() {
        val assemblers = classTree(Class.forName(generatedGraph)).filter { it.declaredMethods.any(::returnsPerAccountCaches) }

        assertThat(assemblers).isNotEmpty()
        assertThat(assemblers.filter { references(it, presenceContribution) }).isNotEmpty()
    }

    private fun classTree(root: Class<*>): List<Class<*>> = listOf(root) + root.declaredClasses.flatMap(::classTree)

    private fun returnsPerAccountCaches(method: java.lang.reflect.Method): Boolean {
        val type = method.genericReturnType as? ParameterizedType ?: return false
        return type.rawType == Set::class.java && type.actualTypeArguments.singleOrNull() == PerAccountCache::class.java
    }

    private fun references(type: Class<*>, internalName: String): Boolean {
        val bytes = type.classLoader.getResourceAsStream(type.name.replace('.', '/') + ".class")?.use { it.readBytes() }
            ?: return false
        return String(bytes, Charsets.ISO_8859_1).contains(internalName)
    }
}
