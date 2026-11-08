package me.meeshy.core.e2ee.content

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

/** Les témoins de `E2EEContentTests.swift`, rejoués à l'octet près : un message scellé sur Android s'ouvre sur iOS. */
class E2eeContentTest {

    private fun content(): E2eeContent = E2eeContent.compose(
        text = "Bonjour", language = "fr", replyTo = null, conversationId = "c1", clientMessageId = "cid_1",
        sentAtMillis = 1_790_000_000_000L,
    )

    @Test
    fun itIsCanonicalJson_withSortedKeys_andNoAbsentField_exactlyAsIos() {
        assertThat(content().encoded().toString(Charsets.UTF_8))
            .isEqualTo("""{"clientMessageId":"cid_1","conversationId":"c1","language":"fr","sentAt":1790000000000,"text":"Bonjour","v":1}""")
    }

    @Test
    fun theAuthorSitsAtTheHeadOfTheSortedKeys_asTheSwiftEncoderWritesIt() {
        val authored = content().authoredBy("64f0c0ffee0000000000aaaa", 3)
        assertThat(authored.encoded().toString(Charsets.UTF_8)).isEqualTo(
            """{"authorDeviceId":3,"authorUserId":"64f0c0ffee0000000000aaaa","clientMessageId":"cid_1","conversationId":"c1",""" +
                """"language":"fr","sentAt":1790000000000,"text":"Bonjour","v":1}""",
        )
    }

    @Test
    fun nonAsciiTextAndSlashesTravelUnescaped_likeWithoutEscapingSlashes() {
        val text = E2eeContent.compose("Héllo / 你好 😀", null, null, "c1", null, 1L)
        assertThat(text.encoded().toString(Charsets.UTF_8)).isEqualTo("""{"conversationId":"c1","sentAt":1,"text":"Héllo / 你好 😀","v":1}""")
    }

    @Test
    fun itRoundTrips() {
        assertThat(E2eeContent.decoded(content().encoded())).isEqualTo(content())
    }

    @Test
    fun anIosEncodedContentDecodes() {
        val ios = """{"authorDeviceId":1,"authorUserId":"alice","clientMessageId":"cid_1","conversationId":"c1","replyTo":"m0","sentAt":1790000000000,"text":"Salut","v":1}"""
        val decoded = E2eeContent.decoded(ios.toByteArray())
        assertThat(decoded.text).isEqualTo("Salut")
        assertThat(decoded.replyTo).isEqualTo("m0")
        assertThat(decoded.isAuthoredBy("alice", 1)).isTrue()
    }

    @Test
    fun aFutureVersion_isNotHalfRead() {
        val error = assertThrows(E2eeContentException.UnsupportedVersion::class.java) {
            E2eeContent.decoded("""{"v":2,"text":"x","sentAt":1}""".toByteArray())
        }
        assertThat(error.version).isEqualTo(2)
    }

    @Test
    fun anObjectWithoutVersion_isNotAContent() {
        assertThrows(E2eeContentException.Malformed::class.java) {
            E2eeContent.decoded("""{"text":"x","sentAt":1}""".toByteArray())
        }
    }

    @Test
    fun fieldsOfALaterLotAreIgnored() {
        val later = """{"v":1,"text":"x","sentAt":1,"conversationId":"c1","mentions":["u"]}"""
        assertThat(E2eeContent.decoded(later.toByteArray()).text).isEqualTo("x")
    }

    @Test
    fun itBelongsOnlyToTheConversationItNames() {
        assertThat(content().belongsTo("c1")).isTrue()
        assertThat(content().belongsTo("c2")).isFalse()
        assertThat(E2eeContent.compose("x", null, null, null, null, 1L).belongsTo("c1")).isFalse()
    }

    @Test
    fun anAuthorlessContent_saysNothingOfItsAuthor_butAHalfAuthorIsRefused() {
        assertThat(content().isAuthoredBy("anyone", 9)).isTrue()
        assertThat(content().authoredBy("alice", 1).isAuthoredBy("alice", 2)).isFalse()
        assertThat(content().copy(authorUserId = "alice").isAuthoredBy("alice", 1)).isFalse()
    }
}
