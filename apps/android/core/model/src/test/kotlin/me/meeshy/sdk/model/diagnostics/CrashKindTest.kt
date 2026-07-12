package me.meeshy.sdk.model.diagnostics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Every [CrashKind] must expose a stable severity (drives the badge colour) and a stable
 * lowercase wire token (drives the shareable text header) — mirroring the iOS `CrashDiagnostic.Kind`
 * badge/label mapping. The tests pin every arm so a renamed or re-classified kind is caught.
 */
class CrashKindTest {

    @Test
    fun severity_mapsErrorKinds() {
        assertThat(CrashKind.EXCEPTION.severity).isEqualTo(CrashSeverity.ERROR)
        assertThat(CrashKind.CRASH.severity).isEqualTo(CrashSeverity.ERROR)
    }

    @Test
    fun severity_mapsWarningKinds() {
        assertThat(CrashKind.ANR.severity).isEqualTo(CrashSeverity.WARNING)
        assertThat(CrashKind.CPU.severity).isEqualTo(CrashSeverity.WARNING)
    }

    @Test
    fun severity_mapsInfoKinds() {
        assertThat(CrashKind.DISK.severity).isEqualTo(CrashSeverity.INFO)
    }

    @Test
    fun wireValue_isStableLowercaseToken() {
        assertThat(CrashKind.EXCEPTION.wireValue).isEqualTo("exception")
        assertThat(CrashKind.CRASH.wireValue).isEqualTo("crash")
        assertThat(CrashKind.ANR.wireValue).isEqualTo("anr")
        assertThat(CrashKind.CPU.wireValue).isEqualTo("cpu")
        assertThat(CrashKind.DISK.wireValue).isEqualTo("disk")
    }

    @Test
    fun everyKind_hasSeverityAndNonBlankWireValue() {
        CrashKind.entries.forEach { kind ->
            assertThat(kind.wireValue).isNotEmpty()
            assertThat(kind.wireValue).isEqualTo(kind.wireValue.lowercase())
            assertThat(CrashSeverity.entries).contains(kind.severity)
        }
    }
}
