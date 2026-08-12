package me.meeshy.sdk.model.diagnostics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [storageValue] / [crashReportsFromStorage] are the durable JSON codec for the persisted crash
 * list. The decode is corruption-safe (blank/absent/malformed → empty) and, mirroring the iOS
 * per-file resilience, a single unparseable entry is skipped rather than losing the whole list.
 */
class CrashReportCodecTest {

    private fun diag(id: String, millis: Long = 1L, kind: CrashKind = CrashKind.EXCEPTION) =
        CrashDiagnostic(id = id, timestampMillis = millis, kind = kind, summary = "s-$id", details = "d-$id")

    @Test
    fun roundTrip_preservesEveryField() {
        val reports = listOf(
            diag("a", 100L, CrashKind.ANR),
            diag("b", 200L, CrashKind.DISK),
        )

        val decoded = crashReportsFromStorage(reports.storageValue)

        assertThat(decoded).isEqualTo(reports)
    }

    @Test
    fun emptyList_roundTripsToEmpty() {
        val decoded = crashReportsFromStorage(emptyList<CrashDiagnostic>().storageValue)

        assertThat(decoded).isEmpty()
    }

    @Test
    fun fromStorage_nullOrBlank_isEmpty() {
        assertThat(crashReportsFromStorage(null)).isEmpty()
        assertThat(crashReportsFromStorage("")).isEmpty()
        assertThat(crashReportsFromStorage("   ")).isEmpty()
    }

    @Test
    fun fromStorage_malformedJson_isEmpty() {
        assertThat(crashReportsFromStorage("{not json")).isEmpty()
        assertThat(crashReportsFromStorage("\"a string\"")).isEmpty()
        assertThat(crashReportsFromStorage("{\"not\":\"an array\"}")).isEmpty()
    }

    @Test
    fun fromStorage_skipsCorruptEntry_keepsValidOnes() {
        val valid = diag("ok", 5L)
        val raw = "[${valid.let { it.storageValueElement() }},{\"garbage\":true}]"

        val decoded = crashReportsFromStorage(raw)

        assertThat(decoded).containsExactly(valid)
    }

    @Test
    fun fromStorage_unknownKeys_ignored() {
        val raw = """[{"id":"x","timestampMillis":7,"kind":"CRASH","summary":"s","details":"d","extra":"ignored"}]"""

        val decoded = crashReportsFromStorage(raw)

        assertThat(decoded).containsExactly(
            CrashDiagnostic("x", 7L, CrashKind.CRASH, "s", "d"),
        )
    }
}

/** Encodes a single diagnostic to its JSON object form for building hand-crafted array fixtures. */
private fun CrashDiagnostic.storageValueElement(): String = listOf(this).storageValue.removeSurrounding("[", "]")
