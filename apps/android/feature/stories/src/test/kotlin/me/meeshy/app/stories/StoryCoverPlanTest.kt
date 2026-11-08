package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

class StoryCoverPlanTest {

    private fun media(id: String, type: FeedMediaType = FeedMediaType.IMAGE, url: String? = "https://m/$id") =
        FeedMedia(id = id, type = type, url = url)

    private fun item(effects: StoryEffects?, vararg media: FeedMedia) =
        StoryItem(id = "s", media = media.toList(), storyEffects = effects)

    @Test
    fun `un texte sur fond colore se rend sans aucune image`() {
        val plan = StoryCoverPlan.of(item(StoryEffects(background = "FF0000", textObjects = listOf(StoryTextObject(id = "t", text = "Hi")))))!!
        assertThat(plan.imageUrlsByObjectId).isEmpty()
        assertThat(plan.requiredObjectIds).isEmpty()
    }

    @Test
    fun `un fond image moderne est indispensable`() {
        val effects = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "bg", postMediaId = "m1", isBackground = true)))
        val plan = StoryCoverPlan.of(item(effects, media("m1")))!!
        assertThat(plan.imageUrlsByObjectId).containsEntry("bg", "https://m/m1")
        assertThat(plan.requiredObjectIds).containsExactly("bg")
    }

    @Test
    fun `un fond video ne donne pas de plan`() {
        val effects = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "bg", postMediaId = "m1", mediaType = "video", isBackground = true)))
        assertThat(StoryCoverPlan.of(item(effects, media("m1", FeedMediaType.VIDEO)))).isNull()
        assertThat(StoryCoverPlan.of(item(StoryEffects(background = "00FF00"), media("m1", FeedMediaType.VIDEO)))).isNull()
    }

    @Test
    fun `une image de fond absente ne donne pas de plan`() {
        val effects = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "bg", postMediaId = "m1", isBackground = true)))
        assertThat(StoryCoverPlan.of(item(effects, media("m1", url = null)))).isNull()
    }

    @Test
    fun `le fond historique remplit l'emplacement legacy`() {
        val plan = StoryCoverPlan.of(item(StoryEffects(), media("m1")))!!
        assertThat(plan.legacyBackgroundUrl).isEqualTo("https://m/m1")
    }

    @Test
    fun `le media d'un sticker n'est jamais pris pour le fond historique`() {
        val effects = StoryEffects(
            background = "112233",
            stickerObjects = listOf(StorySticker(id = "st", postMediaId = "ms")),
        )
        val plan = StoryCoverPlan.of(item(effects, media("ms")))!!
        assertThat(plan.legacyBackgroundUrl).isNull()
        assertThat(plan.imageUrlsByObjectId).containsEntry("st", "https://m/ms")
        assertThat(plan.requiredObjectIds).isEmpty()
    }

    @Test
    fun `un sticker dont le media manque donne quand meme une couverture`() {
        val effects = StoryEffects(background = "112233", stickerObjects = listOf(StorySticker(id = "st", postMediaId = "gone")))
        assertThat(StoryCoverPlan.of(item(effects))).isNotNull()
    }

    @Test
    fun `un emoji ne charge rien`() {
        val effects = StoryEffects(background = "112233", stickerObjects = listOf(StorySticker(id = "st", emoji = "x")))
        assertThat(StoryCoverPlan.of(item(effects))!!.imageUrlsByObjectId).isEmpty()
    }

    @Test
    fun `sans effets, pas de plan`() {
        assertThat(StoryCoverPlan.of(item(null))).isNull()
    }

    @Test
    fun `les candidats sont les dernieres stories non encore couvertes`() {
        val groups = listOf(
            StoryGroup(id = "a", stories = listOf(StoryItem(id = "a1"), StoryItem(id = "a2"))),
            StoryGroup(id = "b", stories = listOf(StoryItem(id = "b1"))),
            StoryGroup(id = "c", stories = emptyList()),
        )
        assertThat(StoryCoverPlan.candidates(groups) { it == "b1" }.map { it.id }).containsExactly("a2")
    }
}
