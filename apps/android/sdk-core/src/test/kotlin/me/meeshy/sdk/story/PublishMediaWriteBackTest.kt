package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryEffectsWireSerializer
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.scene.CanvasMediaAdoption
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreateStoryRequest
import org.junit.Test

class PublishMediaWriteBackTest {

    private fun payloadOf(mediaIds: List<String>?, content: String? = "hi"): String =
        MeeshyApi.json.encodeToString(
            CreateStoryRequest(content = content, mediaIds = mediaIds),
        )

    private fun mediaIdsIn(payload: String): List<String>? =
        MeeshyApi.json.decodeFromString<CreateStoryRequest>(payload).mediaIds

    @Test
    fun `grafts the real id in place of the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNotNull()
        assertThat(mediaIdsIn(rewritten!!)).containsExactly("real-99")
    }

    @Test
    fun `preserves the order and the other ids around the placeholder`() {
        val payload = payloadOf(listOf("a", "upload-cmid", "b"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(mediaIdsIn(rewritten!!)).containsExactly("a", "real-99", "b").inOrder()
    }

    @Test
    fun `replaces every occurrence of the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid", "x", "upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(mediaIdsIn(rewritten!!)).containsExactly("real-99", "x").inOrder()
    }

    @Test
    fun `dedupes when the real id already sits in the list`() {
        val payload = payloadOf(listOf("real-99", "upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(mediaIdsIn(rewritten!!)).containsExactly("real-99")
    }

    @Test
    fun `keeps the rest of the request intact`() {
        val payload = MeeshyApi.json.encodeToString(
            CreateStoryRequest(content = "caption", visibility = "FRIENDS", mediaIds = listOf("upload-cmid")),
        )

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        val decoded = MeeshyApi.json.decodeFromString<CreateStoryRequest>(rewritten!!)
        assertThat(decoded.content).isEqualTo("caption")
        assertThat(decoded.visibility).isEqualTo("FRIENDS")
        assertThat(decoded.mediaIds).containsExactly("real-99")
    }

    @Test
    fun `is inert when the placeholder is absent`() {
        val payload = payloadOf(listOf("other-1", "other-2"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert when there are no media ids`() {
        val payload = payloadOf(mediaIds = null)

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert when the media list is empty`() {
        val payload = payloadOf(mediaIds = emptyList())

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert when the real id equals the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "upload-cmid")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert on an undecodable payload`() {
        val rewritten = PublishMediaWriteBack.graft("not json", placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    // --- le canvas adopte l'identité du vrai téléversement (#5280) ---------------

    private fun background(postMediaId: String, url: String? = "file:///pending.jpg") =
        StoryMediaObject(id = "fond", postMediaId = postMediaId, mediaURL = url, isBackground = true)

    private fun requestOf(effects: StoryEffects?, mediaIds: List<String>?) =
        CreateStoryRequest(content = null, storyEffects = effects, mediaIds = mediaIds)

    private fun roundTrip(request: CreateStoryRequest): CreateStoryRequest =
        MeeshyApi.json.decodeFromString(MeeshyApi.json.encodeToString(request))

    private fun graftedRequest(request: CreateStoryRequest): CreateStoryRequest =
        MeeshyApi.json.decodeFromString<CreateStoryRequest>(
            PublishMediaWriteBack.graft(
                MeeshyApi.json.encodeToString(request),
                placeholder = "upload-cmid",
                realId = "real-99",
            )!!,
        )

    @Test
    fun `grafting the id also makes the canvas designate the real media`() {
        val request = requestOf(StoryEffects(mediaObjects = listOf(background("upload-cmid"))), listOf("upload-cmid"))

        val grafted = graftedRequest(request)

        assertThat(grafted.mediaIds).containsExactly("real-99")
        assertThat(grafted.storyEffects?.mediaObjects?.single()?.postMediaId).isEqualTo("real-99")
    }

    @Test
    fun `a media that was already online keeps its url through the graft`() {
        val request = requestOf(
            StoryEffects(mediaObjects = listOf(background("upload-cmid", url = "https://cdn/pre.jpg"))),
            listOf("upload-cmid"),
        )

        assertThat(graftedRequest(request).storyEffects?.mediaObjects?.single()?.mediaURL)
            .isEqualTo("https://cdn/pre.jpg")
    }

    @Test
    fun `the published document only designates media the post owns`() {
        val request = requestOf(
            StoryEffects(
                mediaObjects = listOf(background("upload-cmid"), StoryMediaObject(id = "p", postMediaId = "other-1")),
                audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "upload-cmid")),
            ),
            listOf("upload-cmid", "other-1"),
        )

        val grafted = graftedRequest(request)

        assertThat(CanvasMediaAdoption.orphanIds(grafted.storyEffects!!, grafted.mediaIds.orEmpty())).isEmpty()
        assertThat(CanvasMediaAdoption.designatedIds(grafted.storyEffects!!)).doesNotContain("upload-cmid")
    }

    @Test
    fun `a sound and a sticker that adopt the real id ride in the post media ids`() {
        val request = requestOf(
            StoryEffects(
                audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "upload-cmid")),
                stickerObjects = listOf(
                    StorySticker(id = "k", postMediaId = "upload-cmid", emoji = "🎉"),
                    StorySticker(id = "k2", postMediaId = "sticker-2"),
                ),
            ),
            listOf("upload-cmid"),
        )

        val grafted = graftedRequest(request)

        assertThat(grafted.storyEffects?.audioPlayerObjects?.single()?.postMediaId).isEqualTo("real-99")
        assertThat(grafted.storyEffects?.stickerObjects?.map { it.postMediaId })
            .containsExactly("real-99", "sticker-2").inOrder()
        assertThat(grafted.mediaIds).containsExactly("real-99", "sticker-2").inOrder()
    }

    @Test
    fun `a canvas that alone designates the placeholder is adopted too`() {
        val request = requestOf(StoryEffects(mediaObjects = listOf(background("upload-cmid"))), mediaIds = null)

        val grafted = graftedRequest(request)

        assertThat(grafted.storyEffects?.mediaObjects?.single()?.postMediaId).isEqualTo("real-99")
        assertThat(grafted.mediaIds).containsExactly("real-99")
    }

    @Test
    fun `an object that designates another media is left intact by the graft`() {
        val request = requestOf(
            StoryEffects(
                mediaObjects = listOf(background("upload-cmid"), StoryMediaObject(id = "p", postMediaId = "other-1")),
            ),
            listOf("upload-cmid", "other-1"),
        )

        val grafted = graftedRequest(request)

        assertThat(grafted.storyEffects?.mediaObjects?.map { it.postMediaId })
            .containsExactly("real-99", "other-1").inOrder()
        assertThat(grafted.mediaIds).containsExactly("real-99", "other-1").inOrder()
    }

    @Test
    fun `a canvas that designates nothing pending leaves the graft inert`() {
        val request = requestOf(StoryEffects(mediaObjects = listOf(background("other-1"))), listOf("other-1"))

        val rewritten = PublishMediaWriteBack.graft(
            MeeshyApi.json.encodeToString(request),
            placeholder = "upload-cmid",
            realId = "real-99",
        )

        assertThat(rewritten).isNull()
    }

    @Test
    fun `a published then reread story renders the same media`() {
        val request = requestOf(
            StoryEffects(
                mediaObjects = listOf(background("upload-cmid")),
                audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "son-1")),
            ),
            listOf("upload-cmid"),
        )
        val grafted = graftedRequest(request)

        val reread = MeeshyApi.json.decodeFromString(
            StoryEffectsWireSerializer,
            MeeshyApi.json.encodeToString(StoryEffectsWireSerializer, grafted.storyEffects!!),
        )

        assertThat(CanvasMediaAdoption.designatedIds(reread)).containsExactly("real-99")
        assertThat(CanvasMediaAdoption.publicationMediaIds(emptyList(), reread))
            .containsExactlyElementsIn(grafted.mediaIds.orEmpty())
        assertThat(CanvasMediaAdoption.isCoherent(reread, grafted.mediaIds.orEmpty())).isTrue()
    }

    // --- la publication initiale : le même scellé que la republication -----------

    @Test
    fun `sealing attaches the sounds, stickers and pre-uploaded media the canvas designates`() {
        val request = requestOf(
            StoryEffects(
                mediaObjects = listOf(StoryMediaObject(id = "p", postMediaId = "pre-photo")),
                audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "son")),
                stickerObjects = listOf(StorySticker(id = "k", postMediaId = "autocollant")),
            ),
            listOf("televersee"),
        )

        val sealed = PublishMediaWriteBack.seal(request)

        assertThat(sealed.mediaIds).containsExactly("televersee", "pre-photo", "son", "autocollant").inOrder()
        assertThat(sealed.storyEffects).isEqualTo(request.storyEffects)
    }

    @Test
    fun `sealing a request that lists everything it designates changes nothing`() {
        val request = requestOf(StoryEffects(mediaObjects = listOf(background("m1"))), listOf("m1", "m2"))

        assertThat(PublishMediaWriteBack.seal(request)).isEqualTo(request)
    }

    @Test
    fun `sealing a text-only story changes nothing`() {
        val request = CreateStoryRequest(content = "bonjour")

        assertThat(PublishMediaWriteBack.seal(request)).isEqualTo(request)
    }

    @Test
    fun `sealing twice is the same as sealing once`() {
        val request = requestOf(
            StoryEffects(audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "son"))),
            null,
        )

        val once = PublishMediaWriteBack.seal(request)

        assertThat(PublishMediaWriteBack.seal(once)).isEqualTo(once)
        assertThat(roundTrip(once).mediaIds).containsExactly("son")
    }

    @Test
    fun `coherence names the media the post did not list`() {
        val request = requestOf(
            StoryEffects(mediaObjects = listOf(background("pre-montee"))),
            listOf("televersee"),
        )

        assertThat(PublishMediaWriteBack.coherenceOf(request))
            .isEqualTo(PublishCoherence.Orphans(listOf("pre-montee")))
    }

    @Test
    fun `coherence is clean when the canvas only designates listed media`() {
        val request = requestOf(StoryEffects(mediaObjects = listOf(background("m1"))), listOf("m1"))

        assertThat(PublishMediaWriteBack.coherenceOf(request)).isEqualTo(PublishCoherence.Coherent)
        assertThat(PublishMediaWriteBack.coherenceOf(CreateStoryRequest(content = "x")))
            .isEqualTo(PublishCoherence.Coherent)
    }
}
