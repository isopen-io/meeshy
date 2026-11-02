package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Le catalogue Android des noms d'événements est tenu contre le contrat TypeScript
 * (`packages/shared/types/socketio-events/ (fichiers event-names.ts)`) : un nom épelé ici qui n'y figure pas
 * est un canal que personne ne parle (Socket.IO ne lève rien, il n'appelle simplement jamais).
 */
class SocketEventNamesParityTest {

    private val hyphenated = Regex("^[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*$")

    private fun contractNames(): Set<String> {
        val dir = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "packages/shared/types/socketio-events") }
            .firstOrNull { it.isDirectory }
        checkNotNull(dir) { "packages/shared/types/socketio-events introuvable depuis ${File("").absolutePath}" }
        val declaration = Regex("""[A-Z][A-Z_0-9]*:\s*'([a-z][a-z-]*:[a-z-]+)'""")
        return dir.listFiles { f -> f.name.endsWith("event-names.ts") }.orEmpty()
            .flatMap { declaration.findAll(it.readText()).map { m -> m.groupValues[1] }.toList() }
            .toSet()
    }

    @Test
    fun `le contrat TypeScript est lu et non vide`() {
        assertThat(contractNames()).contains("message:new")
    }

    @Test
    fun `chaque nom du catalogue existe dans le contrat TypeScript`() {
        val missing = SocketEventNames.all.filterNot { it in contractNames() }
        assertThat(missing).isEmpty()
    }

    @Test
    fun `chaque nom a la forme entite deux-points action-mot avec traits d'union`() {
        val malformed = SocketEventNames.all.filterNot { hyphenated.matches(it) }
        assertThat(malformed).isEmpty()
    }

    @Test
    fun `aucun nom n'est declare deux fois`() {
        assertThat(SocketEventNames.all).containsNoDuplicates()
    }

    @Test
    fun `toute constante declaree figure dans la liste all`() {
        val declared = SocketEventNames::class.java.declaredFields
            .filter { java.lang.reflect.Modifier.isStatic(it.modifiers) && it.type == String::class.java }
            .map { it.also { f -> f.isAccessible = true }.get(null) as String }
        assertThat(SocketEventNames.all).containsExactlyElementsIn(declared)
    }
}
