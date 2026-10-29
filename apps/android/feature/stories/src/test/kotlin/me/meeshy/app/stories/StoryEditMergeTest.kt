package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.app.stories.StoryEditFixtures.BACKGROUND_VIDEO
import me.meeshy.app.stories.StoryEditFixtures.FOREGROUND_PHOTO
import me.meeshy.sdk.model.AnchorV3
import me.meeshy.sdk.model.ObjectV3
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.net.api.UpdatePostRequest
import org.junit.Test

class StoryEditMergeTest {

    private val opening = StoryEditFixtures.opening()
    private val opened = StoryEditFixtures.opened(opening)

    private val production = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = false }

    private fun ready(state: StoryComposerUiState = opened, with: StoryEditOpening = opening): StoryEditPlan.Ready =
        StoryEditMerge.plan(with, state, "fr") as StoryEditPlan.Ready

    private fun rebuilt(state: StoryComposerUiState): StoryEffects? = publishPlans(state, "fr").single().request.storyEffects

    private fun edited(state: StoryComposerUiState, change: (StorySlide) -> StorySlide): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        return state.copy(deck = StorySlideDeck(listOf(change(slide)), slide.id)).mirrorDraftToSelection()
    }

    @Test
    fun `une story iOS rouverte puis enregistree sans geste ne perd pas une cle`() {
        val merged = StoryEditMerge.effects(opening, opened.deck.selectedSlide, rebuilt(opened))

        assertThat(merged).isEqualTo(opening.effects)
        assertThat(ready().optimistic.storyEffects).isEqualTo(opening.effects)
    }

    @Test
    fun `sans geste rien ne part que la composition elle-meme`() {
        val request = ready().request

        assertThat(request.content).isNull()
        assertThat(request.visibility).isNull()
        assertThat(request.visibilityUserIds).isNull()
        assertThat(request.removeMediaIds).isNull()
        assertThat(request.mediaIds).isNull()
        assertThat(request.mentions).isNull()
        assertThat(request.originalLanguage).isNull()
        assertThat(request.type).isNull()
    }

    @Test
    fun `l'aller-retour par le fil v3 garde la disposition d'iOS et l'ecrit comme un document de scene`() {
        val wire = production.encodeToString(UpdatePostRequest.serializer(), ready().request)

        assertThat(wire).contains("\"v\":3")
        assertThat(wire).contains("\"layout\":\"hero\"")
    }

    @Test
    fun `un objet de scene que ce build ne peint pas reste dans le document ecrit`() {
        val mention = ObjectV3(id = "pastille", kind = "mention", anchor = AnchorV3(x = 0.4, y = 0.4))
        val ios = opening.copy(effects = opening.effects.copy(unpaintableObjects = listOf(mention)))

        val wire = production.encodeToString(UpdatePostRequest.serializer(), ready(StoryEditFixtures.opened(ios), ios).request)

        assertThat(wire).contains("\"kind\":\"mention\"")
        assertThat(wire).contains("pastille")
    }

    @Test
    fun `sans disposition ni objet inconnu la charge garde le fil v1 de createStory`() {
        val plain = opening.copy(effects = opening.effects.copy(layout = null))

        val wire = production.encodeToString(UpdatePostRequest.serializer(), ready(StoryEditFixtures.opened(plain), plain).request)

        assertThat(wire).doesNotContain("\"v\":3")
        assertThat(wire).contains("\"textObjects\"")
    }

    @Test
    fun `modifier un texte ne touche pas les autres, qui gardent traductions et keyframes`() {
        val state = edited(opened) { slide ->
            slide.copy(elements = slide.elements.map { if (it.id == "t2") it.copy(text = "Bonsoir") else it })
        }

        val texts = (ready(state).optimistic.storyEffects!!).textObjects

        assertThat(texts.first { it.id == "t1" }).isEqualTo(opening.effects.textObjects.first { it.id == "t1" })
        val t2 = texts.first { it.id == "t2" }
        assertThat(t2.text).isEqualTo("Bonsoir")
        assertThat(t2.translations).isNull()
        assertThat(t2.sourceLanguage).isEqualTo("fr")
    }

    @Test
    fun `deplacer la photo posee garde ses keyframes et son rang`() {
        val state = edited(opened) { slide ->
            slide.copy(placedMedia = slide.placedMedia.map { it.copy(x = 0.9f).normalised() })
        }

        val photo = ready(state).optimistic.storyEffects!!.mediaObjects!!.first { !it.isBackground }

        assertThat(photo.x).isWithin(0.001).of(0.9)
        assertThat(photo.zIndex).isEqualTo(7)
        assertThat(photo.keyframes).isNotNull()
        assertThat(photo.filter).isEqualTo("warm")
    }

    @Test
    fun `deplacer un sticker emoji garde la taille de base et l'ancre d'iOS, et l'image posee reste a son rang`() {
        val state = edited(opened) { slide ->
            slide.copy(stickers = slide.stickers.map { it.copy(x = 0.6f) })
        }

        val stickers = ready(state).optimistic.storyEffects!!.stickerObjects!!

        assertThat(stickers.map { it.id }).containsExactly("st1", "st2").inOrder()
        assertThat(stickers.first { it.id == "st1" }).isEqualTo(opening.effects.stickerObjects!!.first { it.id == "st1" })
        assertThat(stickers.first { it.id == "st2" }.x).isWithin(0.001).of(0.6)
    }

    @Test
    fun `retirer la photo posee la detache du post, et elle seule`() {
        val state = opened.copy(
            deck = opened.deck.removeMedia(FOREGROUND_PHOTO),
            attachments = opened.attachments.filterNot { it.id == FOREGROUND_PHOTO },
        ).mirrorDraftToSelection()

        val plan = ready(state)

        assertThat(plan.request.removeMediaIds).containsExactly(FOREGROUND_PHOTO)
        assertThat(plan.optimistic.media!!.map { it.id }).doesNotContain(FOREGROUND_PHOTO)
        assertThat(plan.optimistic.media!!.map { it.id }).contains(BACKGROUND_VIDEO)
        assertThat(plan.optimistic.storyEffects!!.mediaObjects!!.none { it.postMediaId == FOREGROUND_PHOTO }).isTrue()
    }

    @Test
    fun `l'audience ne part que si l'auteur la change`() {
        val state = opened.copy(draft = opened.draft.withVisibility(StoryVisibility.PRIVATE))

        val request = ready(state).request

        assertThat(request.visibility).isEqualTo("PRIVATE")
        assertThat(request.visibilityUserIds).isNull()
    }

    @Test
    fun `une audience par sélection part avec sa liste`() {
        val state = opened.copy(draft = opened.draft.withVisibility(StoryVisibility.ONLY).withVisibilityUserIds(listOf("64f0a1b2c3d4e5f6a7b8c9ff")))

        val request = ready(state).request

        assertThat(request.visibility).isEqualTo("ONLY")
        assertThat(request.visibilityUserIds).containsExactly("64f0a1b2c3d4e5f6a7b8c9ff")
    }

    @Test
    fun `la legende ne part que si elle change`() {
        val state = edited(opened) { it.copy(text = "Bonsoir") }

        assertThat(ready(state).request.content).isEqualTo("Bonsoir")
    }

    @Test
    fun `une reference ajoutee remplace l'ensemble declare, inchangee elle se tait`() {
        val added = opened.copy(draft = opened.draft.copy(mentions = opened.draft.mentions + PostMentionInput(userId = "64f0a1b2c3d4e5f6a7b8c9cc", username = "bob", display = "NOTE")))

        assertThat(ready(added).request.mentions!!.map { it.username }).containsExactly("ana", "bob")
    }

    @Test
    fun `quand les references silencieuses sont inconnues l'enregistrement n'en parle jamais`() {
        val blind = StoryEditFixtures.opening(mentionsKnown = false)
        val state = StoryEditFixtures.opened(blind)
        val cleared = state.copy(draft = state.draft.copy(mentions = emptyList()))

        assertThat(ready(cleared, blind).request.mentions).isNull()
    }

    @Test
    fun `une story a plusieurs slides ne part pas, elle ne perd pas les autres en silence`() {
        val two = opened.copy(deck = opened.deck.addSlide("extra").updateSelectedText("autre"))

        val plan = StoryEditMerge.plan(opening, two, "fr")

        assertThat(plan).isEqualTo(StoryEditPlan.Refused(StoryEditErrors.ONE_SLIDE))
    }

    @Test
    fun `un media en attente hors ligne refuse l'enregistrement`() {
        val pending = opened.copy(pendingUploads = listOf(PendingMediaUpload("cmid-1", me.meeshy.sdk.media.MediaUploadItem(byteArrayOf(1), "a.jpg", "image/jpeg"))))

        assertThat(StoryEditMerge.plan(opening, pending, "fr")).isEqualTo(StoryEditPlan.Refused(StoryEditErrors.OFFLINE))
    }
}
