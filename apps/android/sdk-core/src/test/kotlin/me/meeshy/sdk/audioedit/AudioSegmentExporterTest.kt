package me.meeshy.sdk.audioedit

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioSegmentExporterTest {

    private fun exporter(runner: FakeRunner) = AudioSegmentExporter(
        AudioEditEngine(FakeProbe(), runner, UnconfinedTestDispatcher()),
        tempDir(),
    )

    @Test
    fun `des bornes dans la tolérance servent la source sans rien rendre`() = runTest {
        val runner = FakeRunner()
        val source = sourceFile()
        val result = exporter(runner).export(source, 0.03..9.98, 10.0)
        assertThat(result).isEqualTo(source)
        assertThat(runner.requests).isEmpty()
    }

    @Test
    fun `needsExport tient compte de chaque borne et d'une durée nulle`() {
        assertThat(AudioSegmentExporter.needsExport(1.0..10.0, 10.0)).isTrue()
        assertThat(AudioSegmentExporter.needsExport(0.0..9.0, 10.0)).isTrue()
        assertThat(AudioSegmentExporter.needsExport(0.0..10.0, 10.0)).isFalse()
        assertThat(AudioSegmentExporter.needsExport(0.0..0.0, 0.0)).isFalse()
    }

    @Test
    fun `un rognage réel matérialise un nouveau m4a`() = runTest {
        val runner = FakeRunner()
        val source = sourceFile()
        val result = exporter(runner).export(source, 2.0..6.0, 10.0)
        assertThat(result).isNotEqualTo(source)
        assertThat(result?.extension).isEqualTo("m4a")
        assertThat(runner.requests.single().plan.finalDuration).isWithin(1e-9).of(4.0)
    }

    @Test
    fun `une découpe nécessaire qui échoue renonce au lieu de publier la piste entière`() = runTest {
        val result = exporter(FakeRunner(failure = IllegalStateException("x"))).export(sourceFile(), 2.0..6.0, 10.0)
        assertThat(result).isNull()
    }
}
