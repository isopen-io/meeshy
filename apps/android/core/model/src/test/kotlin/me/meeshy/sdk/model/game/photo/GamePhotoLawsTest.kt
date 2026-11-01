package me.meeshy.sdk.model.game.photo

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.guide.GameGuideCards
import me.meeshy.sdk.model.game.guide.GuideMomentKey
import me.meeshy.sdk.model.game.rules.OnboardingStepKey
import org.junit.Test

/** Les lois du déroulé photo, de sa mise en page, de ses moments, de la Chronique et des propositions (#13891). */
class GamePhotoLawsTest {

    private fun block(): GameBlock = requireNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun GameBlock.withGlory(rank: GloryRank, division5: Int, glory: Int) =
        copy(glory = this.glory.copy(rank = rank, division5 = division5, glory = glory))

    private fun assertRect(rect: PhotoRect, x: Float, y: Float, width: Float, height: Float) {
        listOf(rect.x to x, rect.y to y, rect.width to width, rect.height to height).forEach { (actual, expected) ->
            assertThat(actual).isWithin(0.01f).of(expected)
        }
    }

    private fun GameBlock.withFlame(days: Int) = copy(flame = flame.copy(days = days))

    private fun GameBlock.withMint(number: Int) = copy(mint = mint.copy(number = number))

    // MARK: - Le déroulé

    @Test
    fun `the flow walks offer, camera, strike, result and keeps the verdict`() {
        val steps = listOf(
            PhotoFlowEvent.Selfie, PhotoFlowEvent.CameraReady, PhotoFlowEvent.Shutter, PhotoFlowEvent.Composed,
            PhotoFlowEvent.Kept(true),
        ).runningFold<PhotoFlowEvent, PhotoFlowState>(PhotoFlowState.Offer) { state, event -> GamePhotoFlow.reduce(state, event) }

        assertThat(steps).containsExactly(
            PhotoFlowState.Offer,
            PhotoFlowState.Camera(PhotoCameraPhase.Opening),
            PhotoFlowState.Camera(PhotoCameraPhase.Live),
            PhotoFlowState.Striking(PhotoMode.Selfie),
            PhotoFlowState.Result(PhotoMode.Selfie, kept = null),
            PhotoFlowState.Result(PhotoMode.Selfie, kept = true),
        ).inOrder()
    }

    @Test
    fun `a shutter before the camera is live, or a keep before a result, is ignored`() {
        val opening = PhotoFlowState.Camera(PhotoCameraPhase.Opening)
        assertThat(GamePhotoFlow.reduce(opening, PhotoFlowEvent.Shutter)).isEqualTo(opening)
        assertThat(GamePhotoFlow.reduce(PhotoFlowState.Offer, PhotoFlowEvent.Kept(true))).isEqualTo(PhotoFlowState.Offer)
        assertThat(GamePhotoFlow.reduce(PhotoFlowState.Striking(PhotoMode.Card), PhotoFlowEvent.Shutter))
            .isEqualTo(PhotoFlowState.Striking(PhotoMode.Card))
    }

    @Test
    fun `a refused camera names its reason and still offers the gallery and the card`() {
        val failed = GamePhotoFlow.reduce(PhotoFlowState.Camera(PhotoCameraPhase.Opening), PhotoFlowEvent.CameraFailed(CameraFailure.Denied))

        assertThat(failed).isEqualTo(PhotoFlowState.Camera(PhotoCameraPhase.Failed(CameraFailure.Denied)))
        assertThat(GamePhotoFlow.reduce(failed, PhotoFlowEvent.Gallery)).isEqualTo(PhotoFlowState.Striking(PhotoMode.Gallery))
        assertThat(GamePhotoFlow.reduce(failed, PhotoFlowEvent.Card)).isEqualTo(PhotoFlowState.Striking(PhotoMode.Card))
    }

    @Test
    fun `later defers, close ends from anywhere, and the end is final`() {
        assertThat(GamePhotoFlow.reduce(PhotoFlowState.Offer, PhotoFlowEvent.Later)).isEqualTo(PhotoFlowState.Done(deferred = true))
        assertThat(GamePhotoFlow.reduce(PhotoFlowState.Striking(PhotoMode.Card), PhotoFlowEvent.Close))
            .isEqualTo(PhotoFlowState.Done(deferred = false))
        assertThat(GamePhotoFlow.reduce(PhotoFlowState.Done(true), PhotoFlowEvent.Selfie)).isEqualTo(PhotoFlowState.Done(true))
        assertThat(GamePhotoFlow.reduce(PhotoFlowState.Striking(PhotoMode.Card), PhotoFlowEvent.ComposeFailed)).isEqualTo(PhotoFlowState.Failed)
    }

    // MARK: - La mise en page (les nombres d'iOS GamePhotoLayout)

    @Test
    fun `the story frame places the emblem, the lines, the birds and the signature like iOS`() {
        val story = GamePhotoLayout.layout(PhotoFormat.Story)

        assertThat(story.width).isEqualTo(1080f)
        assertThat(story.height).isEqualTo(1920f)
        assertRect(story.emblem, 345.6f, 134.4f, 388.8f, 388.8f)
        assertThat(story.title).isEqualTo(PhotoTextLine(540f, 864f, 81f))
        assertThat(story.date.y).isEqualTo(960f)
        assertRect(story.mee, 54f, 1585.2f, 280.8f, 280.8f)
        assertThat(story.meo.x).isEqualTo(1080f - 54f - 280.8f)
        assertRect(story.signature, 486f, 1758f, 108f, 108f)
    }

    @Test
    fun `the square frame keeps its own proportions`() {
        val square = GamePhotoLayout.layout(PhotoFormat.Square)

        assertThat(square.height).isEqualTo(1080f)
        assertThat(square.emblem.width).isEqualTo(324f)
        assertThat(square.kicker.y).isWithin(0.01f).of(529.2f)
        assertThat(square.mee.width).isWithin(0.01f).of(237.6f)
    }

    // MARK: - Les moments

    @Test
    fun `a card of Mee names the moment the game is in, with the Chronicle identities`() {
        val game = block()

        assertThat(GamePhotoMoments.fromCard(GuideMomentKey.NewRank, game))
            .isEqualTo(GamePhotoMoment("rank:polyglotte:3", PhotoStepEmblem.Rank(GloryRank.Polyglotte, 3)))
        assertThat(GamePhotoMoments.fromCard(GuideMomentKey.FirstMint, game))
            .isEqualTo(GamePhotoMoment("meesh:12", PhotoStepEmblem.Meesh(12, MeeshEdition.Silver)))
        assertThat(GamePhotoMoments.fromCard(GuideMomentKey.TreasuryTier, game))
            .isEqualTo(GamePhotoMoment("treasury:escarcelle", PhotoStepEmblem.Treasury(TreasuryTierKey.Escarcelle)))
        assertThat(GamePhotoMoments.fromCard(GuideMomentKey.Level100, game))
            .isEqualTo(GamePhotoMoment("level-100:1", PhotoStepEmblem.Prestige(1)))
        assertThat(GamePhotoMoments.fromCard(GuideMomentKey.NewTier, game)?.id).isEqualTo("tier:nebuleuse:1")
        assertThat(GamePhotoMoments.fromCard(GuideMomentKey.FlameOut, game)).isNull()
    }

    @Test
    fun `the seventh onboarding card opens the start photo, the other steps none`() {
        val game = block()

        assertThat(GamePhotoMoments.ofCard(GameGuideCards.of(OnboardingStepKey.Rank), game)).isEqualTo(GamePhotoMoments.start())
        assertThat(GamePhotoMoments.ofCard(GameGuideCards.of(OnboardingStepKey.Welcome), game)).isNull()
    }

    @Test
    fun `a transition produces the rank gained, the tenth Meesh and the flame threshold crossed`() {
        val before = block().withGlory(GloryRank.Polyglotte, 3, 70_000).withMint(10).withFlame(6)
        val after = before.withGlory(GloryRank.Polyglotte, 2, 75_000).withMint(11).withFlame(7)

        assertThat(GamePhotoMoments.ofTransition(before, after).map { it.id })
            .containsExactly("rank:polyglotte:2", "meesh:10", "flame:7").inOrder()
    }

    @Test
    fun `a state that does not move produces nothing, and a rank without glory gained is not a celebration`() {
        val game = block()
        val demoted = game.withGlory(GloryRank.Voix, 1, 60_000)

        assertThat(GamePhotoMoments.ofTransition(game, game)).isEmpty()
        assertThat(GamePhotoMoments.ofTransition(game, demoted)).isEmpty()
    }

    // MARK: - La Chronique

    private val rank = GamePhotoMoment("rank:voix:2", PhotoStepEmblem.Rank(GloryRank.Voix, 2))
    private val achievement = GamePhotoMoment("achievement:first", PhotoStepEmblem.Start)

    @Test
    fun `keeping replaces the moment's entry and retires the files it no longer writes`() {
        val withSource = GamePhotoNotebookIndex.keptEntry(rank, PhotoMode.Selfie, hasSource = true, NotebookRecipe(rank.id, mirror = true), now = 1)
        val cardOnly = GamePhotoNotebookIndex.keptEntry(rank, PhotoMode.Card, hasSource = false, NotebookRecipe(rank.id), now = 2)

        val plan = GamePhotoNotebookIndex.keep(listOf(withSource), cardOnly)

        assertThat(plan.entries).containsExactly(cardOnly)
        assertThat(plan.obsoleteFiles).containsExactly("rank_voix_2-source.jpg")
        assertThat(cardOnly.files).containsExactly("rank_voix_2-story.jpg")
    }

    @Test
    fun `later writes a moment off the tracks once, and never a step that catches up`() {
        val pending = GamePhotoNotebookIndex.postpone(emptyList(), achievement, now = 5)

        assertThat(pending).containsExactly(NotebookEntry(achievement, NotebookStatus.Pending, 5))
        assertThat(GamePhotoNotebookIndex.postpone(pending!!, achievement, now = 6)).isNull()
        assertThat(GamePhotoNotebookIndex.postpone(emptyList(), rank, now = 5)).isNull()
        assertThat(GamePhotoNotebookIndex.pending(pending)).hasSize(1)
    }

    @Test
    fun `removing returns the remaining list and the files to delete`() {
        val kept = GamePhotoNotebookIndex.keptEntry(rank, PhotoMode.Gallery, hasSource = true, NotebookRecipe(), now = 1)

        val plan = GamePhotoNotebookIndex.remove(listOf(kept), rank.id)

        assertThat(plan?.entries).isEmpty()
        assertThat(plan?.obsoleteFiles).containsExactly("rank_voix_2-story.jpg", "rank_voix_2-source.jpg")
        assertThat(GamePhotoNotebookIndex.remove(listOf(kept), "flame:7")).isNull()
    }

    @Test
    fun `the index reads back what it writes, the most recent first`() {
        val older = GamePhotoNotebookIndex.keptEntry(rank, PhotoMode.Selfie, hasSource = true, NotebookRecipe(rank.id, true), now = 1)
        val newer = NotebookEntry(achievement, NotebookStatus.Pending, 9)
        val tier = GamePhotoMoment("tier:lueur", PhotoStepEmblem.Tier(LevelTierKey.Lueur, 10, 0, 1))
        val third = GamePhotoNotebookIndex.keptEntry(tier, PhotoMode.Card, hasSource = false, NotebookRecipe(), now = 4)

        val read = GamePhotoNotebookIndex.decode(GamePhotoNotebookIndex.encode(listOf(older, newer, third)))

        assertThat(GamePhotoNotebookIndex.sorted(read)).containsExactly(newer, third, older).inOrder()
        assertThat(GamePhotoNotebookIndex.keptIds(read)).containsExactly(rank.id, tier.id)
    }

    @Test
    fun `the kept source is bounded to 1440 pixels and never enlarged`() {
        assertThat(GamePhotoNotebookIndex.reducedSize(3024, 4032)).isEqualTo(1080 to 1440)
        assertThat(GamePhotoNotebookIndex.reducedSize(800, 600)).isEqualTo(800 to 600)
        assertThat(GamePhotoNotebookIndex.sanitized("rank:voix:2")).isEqualTo("rank_voix_2")
    }

    // MARK: - Les propositions

    @Test
    fun `nothing is offered at opening, nor while a gesture is in flight`() {
        val game = block()

        val opening = GamePhotoOffers.observe(PhotoOfferMemory(), game, settled = true)
        val inFlight = GamePhotoOffers.observe(opening.memory, game.withFlame(400), settled = false)

        assertThat(opening.moments).isEmpty()
        assertThat(inFlight.moments).isEmpty()
        assertThat(inFlight.memory).isEqualTo(opening.memory)
    }

    @Test
    fun `a confirmed transition offers one moment, and the same moment never twice`() {
        val before = block().withFlame(6)
        val after = before.withFlame(7)
        val opened = GamePhotoOffers.observe(PhotoOfferMemory(), before, settled = true).memory

        val first = GamePhotoOffers.observe(opened, after, settled = true)
        val chosen = GamePhotoOffers.choose(first.moments, after, emptySet(), emptySet(), first.memory, hasPendingOffer = false)
        val again = GamePhotoOffers.observe(first.memory.copy(previous = before), after, settled = true)

        assertThat(chosen?.id).isEqualTo("flame:7")
        assertThat(again.moments).isEmpty()
    }

    @Test
    fun `a moment the Chronicle knows, or an offer still waiting, is not offered`() {
        val before = block().withFlame(6)
        val after = before.withFlame(7)
        val moments = GamePhotoMoments.ofTransition(before, after)

        assertThat(GamePhotoOffers.choose(moments, after, emptySet(), setOf("flame:7"), PhotoOfferMemory(), false)).isNull()
        assertThat(GamePhotoOffers.choose(moments, after, emptySet(), emptySet(), PhotoOfferMemory(), true)).isNull()
    }

    @Test
    fun `a step that skips another offers the open step of its track instead`() {
        val before = block().withMint(20)
        val after = before.withMint(21)
        val moments = GamePhotoMoments.ofTransition(before, after)

        val chosen = GamePhotoOffers.choose(moments, after, kept = emptySet(), known = emptySet(), PhotoOfferMemory(), false)

        assertThat(moments.map { it.id }).contains("meesh:20")
        assertThat(chosen).isEqualTo(GamePhotoMoment("meesh:1", PhotoStepEmblem.Meesh(1, MeeshEdition.Silver)))
    }
}
