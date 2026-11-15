package me.meeshy.app

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.sdk.model.PermissionNature
import org.junit.Test

// Source guard de la porte unique d'accès : une permission que `PermissionNature` peut demander
// au système mais que le manifeste ne déclare pas est refusée IMMÉDIATEMENT et sans aucune boîte —
// l'utilisateur verrait une carte « refusé » pour un accès qu'il n'a jamais pu accorder. Le garde
// parcourt tous les niveaux d'API supportés (minSdk 26 → targetSdk 35).
class PermissionManifestGuardTest {

    private val supportedApiLevels = 26..35

    private fun manifestText(): String {
        val fromModule = File("src/main/AndroidManifest.xml")
        if (fromModule.isFile) return fromModule.readText()
        val fromRoot = File("app/src/main/AndroidManifest.xml")
        check(fromRoot.isFile) { "AndroidManifest.xml de :app introuvable depuis ${File("").absolutePath}" }
        return fromRoot.readText()
    }

    private fun declaredPermissions(): Set<String> =
        Regex("<uses-permission[^>]*android:name=\"([^\"]+)\"")
            .findAll(manifestText())
            .map { it.groupValues[1] }
            .toSet()

    @Test
    fun `every permission the access gate can request is declared in the manifest`() {
        val declared = declaredPermissions()

        val undeclared = PermissionNature.values().flatMap { nature ->
            supportedApiLevels.flatMap { api -> nature.requirements(api).request.map { "$nature@$api:$it" } }
        }.filterNot { entry -> entry.substringAfter(':') in declared }

        assertWithMessage("permissions demandables mais non déclarées").that(undeclared).isEmpty()
    }
}
