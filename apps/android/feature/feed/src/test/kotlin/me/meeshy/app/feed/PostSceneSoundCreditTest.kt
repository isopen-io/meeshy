package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.BackgroundSoundV3
import me.meeshy.sdk.model.SoundSourceV3
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

/**
 * #14201 — comme iOS `BackgroundSoundBadge.announcement` : la fiche nomme le son du DOCUMENT quand le post le garde, sinon la piste
 * de fond de la première scène, sinon l'identifiant de fond hérité ; et le fil sait, scène par scène, laquelle bouge.
 */
class PostSceneSoundCreditTest {
    private data class Prefs(
        override val systemLanguage: String? = "fr",
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun fixture(name: String): String =
        generateSequence(File(".").absoluteFile) { it.parentFile }
            .map { File(it, "packages/shared/fixtures/canvas-v3/$name.json") }
            .firstOrNull { it.isFile }?.readText()
            ?: throw AssertionError("Fixture partagée introuvable : canvas-v3/$name.json")

    private fun build(json: String) =
        FeedPostBuilder.build(MeeshyApi.json.decodeFromString(ApiPost.serializer(), json), Prefs(), mediaBaseUrl = null)

    private fun scene(effects: StoryEffects) = listOf(StoryItem(id = "p1", storyEffects = effects))

    private fun trace(soundId: String?, name: String? = null, author: String? = null) = StoryAudioPlayerObject(
        id = "bg",
        isBackground = true,
        soundId = soundId,
        name = name,
        soundAuthorUsername = author,
        duration = 12f,
    )

    @Test
    fun `a library sound is credited by its title and its author, an original one by its waveform`() {
        val borrowed = PostSceneSound.credit(scene(StoryEffects(audioPlayerObjects = listOf(trace("snd_1", "Nuits d'été", "@belva")))), null)
        val original = PostSceneSound.credit(scene(StoryEffects(audioPlayerObjects = listOf(trace(null)))), null)

        assertThat(borrowed).isEqualTo(SceneSoundCredit.Library(title = "Nuits d'été", author = "@belva", duration = "0:12"))
        assertThat((borrowed as SceneSoundCredit.Library).line).isEqualTo("Nuits d'été · @belva")
        assertThat(original).isEqualTo(SceneSoundCredit.Original)
    }

    @Test
    fun `the document sound decides first, and a borrowed sound without a name reads as the generic credit`() {
        val library = BackgroundSoundV3(source = SoundSourceV3(t = "library", soundId = "snd_1"))
        val original = BackgroundSoundV3(source = SoundSourceV3(t = "original"))
        val effects = StoryEffects(audioPlayerObjects = listOf(trace(null)))

        assertThat(PostSceneSound.credit(scene(effects), library)).isEqualTo(SceneSoundCredit.Library(null, null, "0:12"))
        assertThat(PostSceneSound.credit(scene(StoryEffects()), original)).isEqualTo(SceneSoundCredit.Original)
        assertThat(SceneSoundCredit.Library(null, null, null).line).isEqualTo("♫ —")
    }

    @Test
    fun `a legacy background id is a borrowed sound, and no sound at all names nothing`() {
        assertThat(PostSceneSound.credit(scene(StoryEffects(backgroundAudioId = "snd_2")), null)).isInstanceOf(SceneSoundCredit.Library::class.java)
        assertThat(PostSceneSound.credit(scene(StoryEffects()), null)).isEqualTo(SceneSoundCredit.None)
        assertThat(PostSceneSound.credit(emptyList(), null)).isEqualTo(SceneSoundCredit.None)
    }

    @Test
    fun `the feed projects the credit of the served document and which scene moves`() {
        val sound = requireNotNull(build("""{ "id": "p1", "type": "POST", "storyEffects": ${fixture("post-carousel-sound-library")} }""").scenes)
        val photos = requireNotNull(build("""{ "id": "p2", "type": "POST", "storyEffects": ${fixture("post-photo-scenes-2")} }""").scenes)
        val video = """{ "v": 3, "scenes": [ { "id": "s1", "objects": [
            { "id": "m1", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 }, "plane": "content", "z": 0,
              "payload": { "mediaURL": "https://cdn.meeshy.me/v.mp4", "mediaType": "video", "isBackground": true } } ] } ] }"""
        val moving = requireNotNull(build("""{ "id": "p3", "type": "POST", "storyEffects": $video }""").scenes)

        assertThat(sound.soundCredit).isEqualTo(SceneSoundCredit.Library(title = null, author = null, duration = "0:15"))
        assertThat(photos.soundCredit).isEqualTo(SceneSoundCredit.None)
        assertThat(photos.moving).containsExactly(false, false).inOrder()
        assertThat(moving.moving).containsExactly(true)
    }
}
