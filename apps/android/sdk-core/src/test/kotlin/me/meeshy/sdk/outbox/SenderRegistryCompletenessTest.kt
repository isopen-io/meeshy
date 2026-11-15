package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.util.jar.JarFile
import org.junit.Test

/**
 * The structural guard of the sender registry: every [OutboxKind] must be bound to a
 * handler by an `@OutboxKindKey` contribution, exactly once.
 *
 * Dagger refuses a duplicate map key at compile time and builds the registry at
 * runtime, but nothing in the graph notices a kind nobody registered — such a row
 * would be drained into "No sender registered" and exhausted on a user's device. This
 * test reads the bindings the compiled Dagger modules declare (the annotation is
 * `RUNTIME`-retained) so adding a kind without its handler file turns the build red.
 */
class SenderRegistryCompletenessTest {

    @Test
    fun `every outbox kind is bound to a handler`() {
        val bound = boundKinds().toSet()

        assertThat(OutboxKind.entries.toSet() - bound).isEmpty()
    }

    @Test
    fun `no outbox kind is bound twice`() {
        val duplicated = boundKinds().groupingBy { it }.eachCount().filterValues { it > 1 }.keys

        assertThat(duplicated).isEmpty()
    }

    @Test
    fun `the scan finds the bindings it is meant to guard`() {
        assertThat(boundKinds()).isNotEmpty()
    }

    private fun boundKinds(): List<OutboxKind> =
        classesUnderSdkPackage()
            .flatMap { runCatching { it.declaredMethods.toList() }.getOrDefault(emptyList()) }
            .mapNotNull { it.getAnnotation(OutboxKindKey::class.java)?.value }

    private fun classesUnderSdkPackage(): List<Class<*>> {
        val loader = Thread.currentThread().contextClassLoader ?: javaClass.classLoader
        val roots = loader.getResources(SDK_PACKAGE_PATH).toList()
            .filter { it.protocol == "file" }
            .map { File(it.toURI()).parentFile.parentFile.parentFile }
        val codeSource = File(OutboxKindKey::class.java.protectionDomain.codeSource.location.toURI())
        return (roots + codeSource).distinct()
            .flatMap(::classNamesIn)
            .distinct()
            .filterNot { '$' in it }
            .mapNotNull { name -> runCatching { Class.forName(name, false, loader) }.getOrNull() }
    }

    private fun classNamesIn(location: File): List<String> =
        if (location.isDirectory) {
            location.walkTopDown()
                .filter { it.extension == "class" }
                .map { it.relativeTo(location).path.replace(File.separatorChar, '/') }
                .toList()
                .let(::sdkClassNames)
        } else {
            JarFile(location).use { jar -> sdkClassNames(jar.entries().toList().map { it.name }) }
        }

    private fun sdkClassNames(paths: List<String>): List<String> =
        paths.filter { it.startsWith("$SDK_PACKAGE_PATH/") && it.endsWith(".class") }
            .map { it.removeSuffix(".class").replace('/', '.') }

    private companion object {
        const val SDK_PACKAGE = "me.meeshy.sdk"
        const val SDK_PACKAGE_PATH = "me/meeshy/sdk"
    }
}
