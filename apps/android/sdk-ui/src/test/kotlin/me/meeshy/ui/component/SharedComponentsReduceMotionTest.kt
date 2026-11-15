package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.getBoundsInRoot
import androidx.activity.ComponentActivity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ViewGroup
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.chrome.FLOATING_BUTTON_LEFT_TAG
import me.meeshy.ui.component.chrome.FloatingButtonSemantics
import me.meeshy.ui.component.chrome.MeeshyFloatingButtons
import me.meeshy.ui.component.kit.MeeshyGlassDensity
import me.meeshy.ui.component.kit.MeeshyGlassMaterial
import me.meeshy.ui.component.kit.MeeshyGlassRecipe
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.location.LiveLocationBadge
import me.meeshy.ui.profile.ProfileAvatar
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #18459 — sous « Réduire les animations » (le réglage de l'APP, [LocalReduceMotion], l'échelle système restant à 1),
 * les composants partagés cessent de glisser, de rebondir et de pulser. Chaque témoin a son contrôle hors réduction :
 * c'est lui qui prouve que l'observation voit bien le mouvement quand il existe.
 *
 * L'horloge est en pause (`autoAdvance = false`) : sans elle, le moteur de test annule les transitions infinies, et une
 * boucle qui tournerait malgré le réglage passerait inaperçue.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SharedComponentsReduceMotionTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun show(reduce: Boolean, content: @Composable () -> Unit) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalReduceMotion provides reduce, content = content)
            }
        }
        compose.mainClock.advanceTimeByFrame()
    }

    /** La vue Compose dessinee en logiciel : sans attendre le repos, qu'une boucle infinie n'atteint jamais. */
    private fun screenPixels(): List<Int> {
        val root = compose.activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        compose.runOnUiThread { root.draw(Canvas(bitmap)) }
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        return pixels.toList()
    }

    private fun screenChangesOverTime(startMillis: Long = 120, laterMillis: Long = 450): Boolean {
        compose.mainClock.advanceTimeBy(startMillis)
        val early = screenPixels()
        compose.mainClock.advanceTimeBy(laterMillis)
        return early != screenPixels()
    }

    private fun DpRect.width() = right.value - left.value

    // MARK: - Boucles infinies

    @Test
    fun `under reduced motion the shimmer placeholder does not breathe`() {
        show(reduce = true) { MeeshyShimmerPlaceholder(Modifier.size(80.dp)) }
        assertThat(screenChangesOverTime()).isFalse()
    }

    @Test
    fun `without reduced motion the shimmer placeholder breathes`() {
        show(reduce = false) { MeeshyShimmerPlaceholder(Modifier.size(80.dp)) }
        assertThat(screenChangesOverTime()).isTrue()
    }

    private val badge: @Composable () -> Unit = {
        LiveLocationBadge(username = "Ada", expiresAtMillis = System.currentTimeMillis() + 3_600_000L)
    }

    @Test
    fun `under reduced motion the live location dot does not pulse`() {
        show(reduce = true, content = badge)
        assertThat(screenChangesOverTime()).isFalse()
    }

    @Test
    fun `without reduced motion the live location dot pulses`() {
        show(reduce = false, content = badge)
        assertThat(screenChangesOverTime()).isTrue()
    }

    // MARK: - Échelles d'appui

    private fun authButtonWidths(reduce: Boolean): Pair<Float, Float> {
        show(reduce) { Box(Modifier.size(300.dp, 120.dp)) { AuthActionButton(title = "Go", onClick = {}) } }
        compose.mainClock.advanceTimeBy(600)
        val button = compose.onNodeWithText("Go")
        val rest = button.getBoundsInRoot().width()
        button.performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(600)
        val pressed = button.getBoundsInRoot().width()
        button.performTouchInput { up() }
        return rest to pressed
    }

    @Test
    fun `under reduced motion the auth action button keeps its scale when pressed`() {
        val (rest, pressed) = authButtonWidths(reduce = true)
        assertThat(pressed).isEqualTo(rest)
    }

    @Test
    fun `without reduced motion the auth action button shrinks when pressed`() {
        val (rest, pressed) = authButtonWidths(reduce = false)
        assertThat(pressed).isLessThan(rest)
    }

    private var storageWrites = 0

    private fun showFloatingDisc(reduce: Boolean) {
        show(reduce) {
            Box(Modifier.fillMaxSize()) {
                MeeshyFloatingButtons(
                    leftStorage = FloatingButtonGeometry.DEFAULT_FEED_STORAGE,
                    rightStorage = FloatingButtonGeometry.DEFAULT_MENU_STORAGE,
                    onLeftStorageChange = { storageWrites++ },
                    onRightStorageChange = {},
                    onLeftTap = {},
                    onLeftLongPress = {},
                    onRightTap = {},
                    onRightLongPress = {},
                    leftSemantics = FloatingButtonSemantics(label = "Flux"),
                    rightSemantics = FloatingButtonSemantics(label = "Menu"),
                    leftContent = { Box(Modifier.fillMaxSize().background(Color.Blue, CircleShape)) },
                    rightContent = {},
                )
            }
        }
        compose.mainClock.advanceTimeBy(1_000)
    }

    private fun disc() = compose.onNodeWithTag(FLOATING_BUTTON_LEFT_TAG)

    private fun pressDisc() {
        disc().performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(600)
    }

    @Test
    fun `under reduced motion the floating disc keeps its scale when pressed but lays its veil`() {
        showFloatingDisc(reduce = true)
        val restWidth = disc().getBoundsInRoot().width()
        val restPixels = screenPixels()

        pressDisc()

        assertThat(disc().getBoundsInRoot().width()).isEqualTo(restWidth)
        assertThat(screenPixels()).isNotEqualTo(restPixels)
    }

    @Test
    fun `without reduced motion the pressed floating disc grows to the glass press scale`() {
        showFloatingDisc(reduce = false)
        val restWidth = disc().getBoundsInRoot().width()

        pressDisc()

        val glassPress = MeeshyGlassRecipe.resolve(
            tone = MeeshyGlassTone.Theme,
            density = MeeshyGlassDensity.Regular,
            isTinted = false,
            isInteractive = true,
            isPressed = true,
            material = MeeshyGlassMaterial.Drawn,
            reduceMotion = false,
        ).scale
        assertThat(disc().getBoundsInRoot().width()).isWithin(0.5f).of(restWidth * glassPress)
    }

    @Test
    fun `the press response never steals the drag of the floating disc`() {
        showFloatingDisc(reduce = false)

        disc().performTouchInput { swipeUp(startY = centerY, endY = centerY - 300f, durationMillis = 300) }
        compose.mainClock.advanceTimeBy(1_000)

        assertThat(storageWrites).isEqualTo(1)
    }

    // MARK: - Entrées

    private fun avatarMovesWhileEntering(reduce: Boolean): Boolean {
        show(reduce) { ProfileAvatar(name = "Ada", avatarUrl = null, accent = Color.Red) }
        return screenChangesOverTime(startMillis = 0, laterMillis = 2_000)
    }

    @Test
    fun `under reduced motion the profile avatar enters without a scale`() {
        assertThat(avatarMovesWhileEntering(reduce = true)).isFalse()
    }

    @Test
    fun `without reduced motion the profile avatar springs in from a smaller scale`() {
        assertThat(avatarMovesWhileEntering(reduce = false)).isTrue()
    }

    private fun toastTops(reduce: Boolean): Pair<Float, Float> {
        val toasts = MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 1)
        show(reduce) { FeedbackToastHost(toasts = toasts, displayMillis = 10_000L) }
        compose.mainClock.advanceTimeBy(100)
        toasts.tryEmit(FeedbackToastRequest(R.string.common_close, FeedbackKind.Success))
        compose.mainClock.advanceTimeBy(64)
        val entering = compose.onNodeWithTag(FEEDBACK_TOAST_TAG).getBoundsInRoot().top.value
        compose.mainClock.advanceTimeBy(1_000)
        return entering to compose.onNodeWithTag(FEEDBACK_TOAST_TAG).getBoundsInRoot().top.value
    }

    @Test
    fun `under reduced motion the feedback toast fades in place`() {
        val (entering, settled) = toastTops(reduce = true)
        assertThat(entering).isEqualTo(settled)
    }

    @Test
    fun `without reduced motion the feedback toast slides up`() {
        val (entering, settled) = toastTops(reduce = false)
        assertThat(entering).isGreaterThan(settled)
    }

    private fun foldedBadgeWidths(reduce: Boolean): Pair<Float, Float> {
        var expanded by mutableStateOf(true)
        show(reduce) {
            CollapsibleSectionHeader(title = "Section", color = Color.Red, expanded = expanded, onToggle = {}, foldedUnread = 3)
        }
        compose.mainClock.advanceTimeBy(600)
        compose.runOnIdle {
            expanded = false
            Snapshot.sendApplyNotifications()
        }
        compose.mainClock.advanceTimeBy(48)
        val entering = compose.onNodeWithTag(COLLAPSIBLE_FOLDED_UNREAD_TAG, useUnmergedTree = true).getBoundsInRoot().width()
        compose.mainClock.advanceTimeBy(1_000)
        return entering to compose.onNodeWithTag(COLLAPSIBLE_FOLDED_UNREAD_TAG, useUnmergedTree = true).getBoundsInRoot().width()
    }

    @Test
    fun `under reduced motion the folded unread badge enters by a fade alone`() {
        val (entering, settled) = foldedBadgeWidths(reduce = true)
        assertThat(entering).isEqualTo(settled)
    }

    @Test
    fun `without reduced motion the folded unread badge grows in`() {
        val (entering, settled) = foldedBadgeWidths(reduce = false)
        assertThat(entering).isLessThan(settled)
    }
}
