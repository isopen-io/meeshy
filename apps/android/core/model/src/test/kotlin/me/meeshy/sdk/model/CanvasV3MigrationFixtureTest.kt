package me.meeshy.sdk.model

import me.meeshy.sdk.model.CanvasV3FixtureSupport.assertSameJson
import me.meeshy.sdk.model.CanvasV3FixtureSupport.fixture
import org.junit.Test

/**
 * Le juge du pont d'écriture est la paire de fixtures PARTAGÉE avec le
 * convertisseur de la passerelle et le pont Swift : la conversion de `X.json`
 * doit produire `X.v3.json` à l'égalité exacte des valeurs décimales.
 */
class CanvasV3MigrationFixtureTest {

    @Test
    fun `v1-legacy-full se convertit exactement en sa fixture v3`() {
        assertSameJson(fixture("v1-legacy-full.v3"), CanvasV3Migration.convert(fixture("v1-legacy-full")))
    }

    @Test
    fun `v1-legacy-rich se convertit exactement en sa fixture v3`() {
        assertSameJson(fixture("v1-legacy-rich.v3"), CanvasV3Migration.convert(fixture("v1-legacy-rich")))
    }
}
