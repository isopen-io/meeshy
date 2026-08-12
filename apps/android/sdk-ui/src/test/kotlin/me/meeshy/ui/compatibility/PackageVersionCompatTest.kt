package me.meeshy.ui.compatibility

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * La regle « comment lire le code de version d'un paquet » vivait recopiee a
 * l'identique dans AboutScreen et SupportScreen. Deux copies d'une regle de version
 * ne restent pas d'accord : c'est exactement ce que le dossier compatibility existe
 * pour empecher.
 *
 * Le niveau d'API est un parametre explicite, donc le seuil se teste des DEUX cotes
 * sans emulateur — un test qui ne vaudrait que sur la version de la machine ne
 * prouverait rien sur la plage Oreo -> Android 17.
 */
class PackageVersionCompatTest {

    @Test
    fun `from API 28 the long version code is used`() {
        assertEquals(
            42L,
            resolvePackageVersionCode(sdkInt = 28, longVersionCode = { 42L }, legacyVersionCode = { 7 }),
        )
    }

    @Test
    fun `the long version code still applies on Android 16 and 17`() {
        assertEquals(
            99L,
            resolvePackageVersionCode(sdkInt = 36, longVersionCode = { 99L }, legacyVersionCode = { 7 }),
        )
        assertEquals(
            99L,
            resolvePackageVersionCode(sdkInt = 37, longVersionCode = { 99L }, legacyVersionCode = { 7 }),
        )
    }

    // Le plancher du projet. Sous API 28, lire longVersionCode leverait.
    @Test
    fun `on Oreo the legacy version code is used, widened to Long`() {
        assertEquals(
            7L,
            resolvePackageVersionCode(sdkInt = 26, longVersionCode = { error("must not be read") }, legacyVersionCode = { 7 }),
        )
    }

    @Test
    fun `API 27 is still below the threshold`() {
        assertEquals(
            7L,
            resolvePackageVersionCode(sdkInt = 27, longVersionCode = { error("must not be read") }, legacyVersionCode = { 7 }),
        )
    }
}
