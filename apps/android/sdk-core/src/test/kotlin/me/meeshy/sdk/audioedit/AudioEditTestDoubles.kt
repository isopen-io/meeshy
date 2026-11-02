package me.meeshy.sdk.audioedit

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.CompletableDeferred

internal fun tempDir(): File = createTempDirectory("audioedit").toFile()

internal fun sourceFile(dir: File = tempDir(), name: String = "source.m4a"): File =
    File(dir, name).apply { writeBytes(ByteArray(32) { 7 }) }

internal class FakeProbe(private val status: AudioSourceStatus = AudioSourceStatus.READABLE) : AudioSourceProbe {
    override fun status(file: File): AudioSourceStatus = status
}

internal class FakeRunner(
    private val failure: Throwable? = null,
    private val gate: CompletableDeferred<Unit>? = null,
    private val writesOutput: Boolean = true,
) : AudioTransformRunner {
    val requests = mutableListOf<AudioTransformRequest>()

    override suspend fun run(request: AudioTransformRequest) {
        requests += request
        if (writesOutput) request.output.writeBytes(ByteArray(16) { 1 })
        gate?.await()
        failure?.let { throw it }
    }
}
