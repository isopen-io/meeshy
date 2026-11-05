package me.meeshy.app.stories

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import coil.Coil
import coil.ImageLoader
import coil.intercept.Interceptor
import coil.request.ErrorResult
import coil.request.ImageResult
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.feature.stories.R
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.capture.SceneQuickCapture
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14499 — un rail du compositeur (la colonne d'outils au repos, les options de ce qu'on édite, le niveau posé par-dessus)
 * vit dans son couloir : il ne se dessine jamais sur une zone de contrôle — ✕ ↶ ↷, la rangée des diapos, l'invite de la
 * caméra, la barre du bas (audience · Publier) ou la bande d'un réglage. Trop long, il défile ; ⋯ reste visible.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp")
class ComposerRailBoundsTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        Coil.setImageLoader(ImageLoader.Builder(ApplicationProvider.getApplicationContext()).components { add(NoImages) }.build())
    }

    @After
    fun tearDown() {
        Coil.reset()
        Dispatchers.resetMain()
    }

    private object NoImages : Interceptor {
        override suspend fun intercept(chain: Interceptor.Chain): ImageResult =
            ErrorResult(null, chain.request, IllegalStateException("not loaded in a test"))
    }

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun composer(format: ComposerFormat): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also {
            it.onEnterComposer()
            it.onFormats(listOf(format), null)
        }
    }

    private fun capture() = StorySceneCapture(
        offer = SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true),
        onCaptured = {},
        viewfinder = { _, _ -> Text("viewfinder") },
    )

    private fun show(vm: StoryComposerViewModel, width: Dp, height: Dp) {
        compose.setContent {
            MeeshyTheme(darkTheme = true) {
                CompositionLocalProvider(LocalReduceMotion provides true, LocalStickerLift provides StickerLiftSource { _, _ -> {} }) {
                    Box(Modifier.size(width = width, height = height)) {
                        val state by vm.state.collectAsState()
                        var sheet by remember { mutableStateOf<StoryComposerSheet?>(null) }
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                            morePanel = null,
                            onMorePanel = {},
                            formatChevron = {},
                            sheet = StorySheetSlot(open = sheet, onDismiss = { sheet = null }, onOpen = { sheet = it }) {},
                            capture = capture(),
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    private fun withPlacedImage(vm: StoryComposerViewModel) {
        val media = UploadedMedia(id = "m1", url = "https://cdn/m1", mimeType = "image/jpeg", fileSize = 1, width = 1080, height = 1920, durationMs = null, thumbnailUrl = "https://cdn/t")
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            val loaded = state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("m1")) else it }),
                attachments = listOf(media),
            )
            StoryComposerSelectionReducer.mediaSelected(StoryComposerPlacedMediaReducer.placed(loaded, "m1"), "m1")
        }
    }

    private val canvases get() = listOf(string(R.string.stories_composer_canvas), string(R.string.stories_composer_canvas_post))

    private val onScene: SemanticsMatcher get() = canvases.map { hasAnyAncestor(hasContentDescription(it)) or hasContentDescription(it) }.reduce { a, b -> a or b }

    private val inLane = hasAnyAncestor(hasTestTag(SCENE_RAIL_LANE_TAG))

    /** Une cible qui se montre ; le CONTENEUR nommé de la colonne (« Outils de la scène », #15863) n'en est pas une. */
    private val shown = SemanticsMatcher("shown") { node ->
        node.config.contains(SemanticsProperties.ContentDescription) || node.config.contains(SemanticsProperties.Text)
    } and !hasTestTag(SCENE_TOOL_COLUMN_TAG)

    private fun visible(nodes: List<SemanticsNode>): List<Pair<String, Rect>> = nodes
        .map { node -> label(node) to node.boundsInRoot }
        .filter { (_, rect) -> rect.width > 0.5f && rect.height > 0.5f }

    private fun label(node: SemanticsNode): String =
        (node.config.getOrElseNullable(SemanticsProperties.ContentDescription) { null }?.joinToString()
            ?: node.config.getOrElseNullable(SemanticsProperties.Text) { null }?.joinToString { it.text }).orEmpty()

    /** Ce que le rail montre, rogné par son défilement. */
    private fun rail(): List<Pair<String, Rect>> = visible(compose.onAllNodes(inLane and shown).fetchSemanticsNodes())

    /** Les zones de contrôle hors du rail : ✕ ↶ ↷, la rangée des diapos, l'invite, le socle, la bande d'un réglage. */
    private fun controls(): List<Pair<String, Rect>> =
        visible(compose.onAllNodes(shown and !inLane and !onScene and !hasTestTag(SCENE_RAIL_LANE_TAG)).fetchSemanticsNodes())

    private fun assertNoOverlap() {
        val rail = rail()
        val controls = controls()
        val overlaps = rail.flatMap { (name, rect) -> controls.filter { it.second.overlaps(rect) }.map { "$name × ${it.first}" } }
        assertThat(rail).isNotEmpty()
        assertThat(overlaps).isEmpty()
    }

    @Test
    fun `at rest under the account banner, the tool column of a post with two slides stays in its lane`() {
        val vm = composer(ComposerFormat.POST)
        vm.onAddSlide()
        show(vm, 360.dp, 545.dp)

        assertNoOverlap()
        val more = rail().single { it.first == string(R.string.stories_scene_overflow_menu) }.second
        assertThat(more.height).isWithin(1f).of(48f)
    }

    @Test
    fun `on a 360 by 640 phone, the tool column of a post with two slides stays in its lane`() {
        val vm = composer(ComposerFormat.POST)
        vm.onAddSlide()
        show(vm, 360.dp, 640.dp)

        assertNoOverlap()
    }

    @Test
    fun `a selected placed image lays a long rail that scrolls in its lane, under the account banner`() {
        val vm = composer(ComposerFormat.STORY)
        withPlacedImage(vm)
        show(vm, 360.dp, 545.dp)

        assertNoOverlap()
    }

    @Test
    fun `a setting opened from the rail stacks its level above the band, never over it, on a 360 by 640 phone`() {
        val vm = composer(ComposerFormat.STORY)
        withPlacedImage(vm)
        show(vm, 360.dp, 640.dp)
        compose.onNodeWithText(string(R.string.composer_column_media_crop)).performScrollTo().performClick()
        compose.waitForIdle()

        assertNoOverlap()
    }

    /** Le pas d'un groupe de cibles qui se suivent, mesuré sur leur place entière : le défilement rogne les bornes, pas le pas. */
    private fun pitchesOf(matcher: SemanticsMatcher): List<Float> = compose.onAllNodes(inLane and shown and matcher).fetchSemanticsNodes()
        .filter { it.size.height >= 47 }
        .map { it.positionInRoot.y }
        .zipWithNext { a, b -> b - a }

    /** Les outils qui défilent, puis le pied posé sous eux (« Texte du post », ⋯) : deux suites, chacune à son pas. */
    private fun pitches(): List<Float> = pitchesOf(hasAnyAncestor(hasScrollAction())) + pitchesOf(!hasAnyAncestor(hasScrollAction()))

    @Test
    fun `on a small screen the round buttons of the rail tighten to a 48 dp pitch, their targets kept at 48 dp`() {
        val vm = composer(ComposerFormat.POST)
        show(vm, 360.dp, 545.dp)

        val targets = rail().map { it.second }.filter { it.height >= 47f }
        assertThat(targets.map { it.width }.distinct()).containsExactly(48f)
        assertThat(pitches().distinct()).containsExactly(48f)
    }

    @Test
    @Config(sdk = [34], qualifiers = "fr-w411dp-h891dp")
    fun `a roomy phone keeps its 52 dp pitch`() {
        val vm = composer(ComposerFormat.POST)
        show(vm, 411.dp, 846.dp)

        assertThat(pitches().distinct()).containsExactly(52f)
    }

    @Test
    fun `on a small screen an option of the editing rail keeps a 48 dp target`() {
        val vm = composer(ComposerFormat.STORY)
        withPlacedImage(vm)
        show(vm, 360.dp, 545.dp)

        val options = rail().map { it.second }.filter { it.top > 0f && it.bottom < 520f }
        assertThat(options).isNotEmpty()
        options.forEach { assertThat(it.height).isAtLeast(48f) }
        assertThat(options.zipWithNext { a, b -> b.top - a.bottom }.distinct()).containsExactly(0f)
    }

    /** La scène telle qu'elle est PEINTE, échelle et décalage du `graphicsLayer` compris. */
    private fun drawnScene(): Rect = compose.onAllNodes(canvases.map { hasContentDescription(it) }.reduce { a, b -> a or b })
        .fetchSemanticsNodes().first().boundsInRoot

    private fun boundsOf(id: Int): Rect = compose.onAllNodes(hasContentDescription(string(id))).fetchSemanticsNodes().single().boundsInRoot

    private fun Rect.isInside(outer: Rect): Boolean =
        left >= outer.left - 0.5f && top >= outer.top - 0.5f && right <= outer.right + 0.5f && bottom <= outer.bottom + 0.5f

    /** ✕, ↶ ↷ et chaque bouton visible de la colonne, dans la scène dessinée ; ✕ et ↶ sous son bord haut. */
    private fun assertChromeOnTheDrawnScene() {
        val scene = drawnScene()
        val close = boundsOf(R.string.composer_scene_close)
        val undo = boundsOf(R.string.composer_history_undo)
        val outside = (listOf("✕" to close, "↶" to undo) + rail()).filterNot { it.second.isInside(scene) }.map { it.first }
        assertThat(scene.width).isLessThan(359f)
        assertThat(outside).isEmpty()
        assertThat(close.top).isAtLeast(scene.top)
        assertThat(undo.top).isAtLeast(scene.top)
    }

    @Test
    fun `on a short screen the story scene is narrower than the window, and the cross, undo and the column sit on it`() {
        val vm = composer(ComposerFormat.STORY)
        vm.onAddSlide()
        show(vm, 360.dp, 545.dp)

        assertChromeOnTheDrawnScene()
        assertNoOverlap()
    }

    @Test
    fun `on a short screen the post scene keeps the cross, undo and the column on it, and publish clear of the more button`() {
        val vm = composer(ComposerFormat.POST)
        vm.onAddSlide()
        show(vm, 360.dp, 545.dp)

        assertChromeOnTheDrawnScene()
        val more = rail().single { it.first == string(R.string.stories_scene_overflow_menu) }.second
        val publish = controls().filter { it.second.top > more.top }.minOf { it.second.top }
        assertThat(more.bottom).isAtMost(publish)
    }
}
