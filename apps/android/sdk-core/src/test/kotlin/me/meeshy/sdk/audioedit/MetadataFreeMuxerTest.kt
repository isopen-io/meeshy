package me.meeshy.sdk.audioedit

import androidx.annotation.OptIn
import androidx.media3.common.Format
import androidx.media3.common.Metadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.muxer.BufferInfo
import androidx.media3.muxer.Muxer
import com.google.common.collect.ImmutableList
import com.google.common.truth.Truth.assertThat
import java.nio.ByteBuffer
import org.junit.Test

@OptIn(UnstableApi::class)
class MetadataFreeMuxerTest {

    private class RecordingMuxer : Muxer {
        val calls = mutableListOf<String>()
        val entries = mutableListOf<Metadata.Entry>()

        override fun addTrack(format: Format): Int = TRACK_ID.also { calls += "track:${format.sampleMimeType}" }

        override fun writeSampleData(trackId: Int, data: ByteBuffer, bufferInfo: BufferInfo) {
            calls += "sample:${data.remaining()}"
        }

        override fun addMetadataEntry(metadataEntry: Metadata.Entry) {
            entries += metadataEntry
        }

        override fun close() {
            calls += "close"
        }
    }

    private class RecordingFactory(val muxer: RecordingMuxer, private val negativeTimestamps: Boolean = false) : Muxer.Factory {
        var path: String? = null

        override fun create(path: String): Muxer = muxer.also { this.path = path }

        override fun getSupportedSampleMimeTypes(trackType: Int): ImmutableList<String> = ImmutableList.of(MimeTypes.AUDIO_AAC)

        override fun supportsWritingNegativeTimestampsInEditList(): Boolean = negativeTimestamps
    }

    /** Une entrée comme `Mp4LocationData` : ce que Media3 recopie de la piste source. */
    private object LocationEntry : Metadata.Entry

    @Test
    fun `le lieu de la source ne rejoint jamais le fichier rendu, la piste et ses echantillons si`() {
        val inner = RecordingMuxer()
        val factory = RecordingFactory(inner)
        val muxer = MetadataFreeMuxerFactory(factory).create("/out.m4a")

        val track = muxer.addTrack(Format.Builder().setSampleMimeType(MimeTypes.AUDIO_AAC).build())
        muxer.addMetadataEntry(LocationEntry)
        muxer.writeSampleData(track, ByteBuffer.allocate(8), BufferInfo(0L, 8, 0))
        muxer.close()

        assertThat(factory.path).isEqualTo("/out.m4a")
        assertThat(inner.entries).isEmpty()
        assertThat(inner.calls).containsExactly("track:${MimeTypes.AUDIO_AAC}", "sample:8", "close").inOrder()
    }

    @Test
    fun `les types pris en charge restent ceux du muxeur d origine`() {
        val factory = MetadataFreeMuxerFactory(RecordingFactory(RecordingMuxer()))
        assertThat(factory.getSupportedSampleMimeTypes(androidx.media3.common.C.TRACK_TYPE_AUDIO)).containsExactly(MimeTypes.AUDIO_AAC)
    }

    @Test
    fun `la liste de montage du muxeur d origine reste la sienne`() {
        assertThat(MetadataFreeMuxerFactory(RecordingFactory(RecordingMuxer(), negativeTimestamps = true)).supportsWritingNegativeTimestampsInEditList()).isTrue()
        assertThat(MetadataFreeMuxerFactory(RecordingFactory(RecordingMuxer())).supportsWritingNegativeTimestampsInEditList()).isFalse()
    }

    private companion object {
        const val TRACK_ID = 0
    }
}
