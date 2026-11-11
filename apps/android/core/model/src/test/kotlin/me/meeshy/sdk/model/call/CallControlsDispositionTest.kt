package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import kotlin.math.abs
import org.junit.Test

/**
 * #17327 — où se rangent les actions que le (…) déploie, selon le nombre de participants. Miroir de iOS
 * `CallControlsDispositionTests` : À DEUX, deux rails sur les bords (« mon image » au début, « l'appel » à la fin, la
 * pilule ne grandit pas) ; À PLUSIEURS, deux rangées légendées DANS la pilule (aucun rail par-dessus la grille). Le
 * passage de deux à trois en cours d'appel change la forme, jamais l'état du (…).
 */
class CallControlsDispositionTest {

    private fun actions(isVideoEnabled: Boolean = true) = CallActionSet.resolve(
        CallActionContext(
            isDesktop = false,
            isVideoEnabled = isVideoEnabled,
            hasSelectableCameras = false,
            isConnected = true,
            mayRecord = true,
        ),
    )

    private fun families(rows: List<CallActionFamilyRow>) = rows.map { it.family }

    @Test
    fun `a duo is on rails`() {
        assertThat(CallControlsDisposition.resolve(participantCount = 2)).isEqualTo(CallControlsDisposition.Rails)
    }

    @Test
    fun `alone while waiting is on rails`() {
        assertThat(CallControlsDisposition.resolve(participantCount = 1)).isEqualTo(CallControlsDisposition.Rails)
    }

    @Test
    fun `three or more is on rows`() {
        assertThat(CallControlsDisposition.resolve(participantCount = 3)).isEqualTo(CallControlsDisposition.Rows)
        assertThat(CallControlsDisposition.resolve(participantCount = 8)).isEqualTo(CallControlsDisposition.Rows)
    }

    @Test
    fun `a group grid on screen is on rows whatever the count`() {
        assertThat(CallControlsDisposition.resolve(participantCount = 2, showsGroupGrid = true))
            .isEqualTo(CallControlsDisposition.Rows)
    }

    @Test
    fun `rails with the menu open are one per family, my image then the call`() {
        val rows = CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Menu)
        assertThat(families(rows)).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
    }

    @Test
    fun `rails with the menu closed or a mode on screen leave no rail`() {
        assertThat(CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Idle)).isEmpty()
        assertThat(CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Mode(CallScreenMode.Effects))).isEmpty()
    }

    @Test
    fun `an option drawn in the pill hides the rails`() {
        assertThat(CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Panel(CallScreenPanel.React))).isEmpty()
        assertThat(CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Panel(CallScreenPanel.Record))).isEmpty()
    }

    @Test
    fun `a sheet panel keeps the rails`() {
        assertThat(CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Panel(CallScreenPanel.Journal))).hasSize(2)
        assertThat(CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Panel(CallScreenPanel.People))).hasSize(2)
    }

    @Test
    fun `camera off, my image keeps only the camera and the screen`() {
        val mine = CallControlsDisposition.Rails.railRows(actions(isVideoEnabled = false), CallScreenLayer.Menu)
            .first { it.family == CallActionFamily.MyImage }
        assertThat(mine.actions).containsExactly(CallAction.Camera, CallAction.ScreenShare).inOrder()
    }

    @Test
    fun `camera on, my image is camera, flip, effects, screen`() {
        val mine = CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Menu)
            .first { it.family == CallActionFamily.MyImage }
        assertThat(mine.actions).containsExactly(
            CallAction.Camera, CallAction.FlipCamera, CallAction.Effects, CallAction.ScreenShare,
        ).inOrder()
    }

    @Test
    fun `the call is captions, record, add, journal, react, capture`() {
        val call = CallControlsDisposition.Rails.railRows(actions(), CallScreenLayer.Menu)
            .first { it.family == CallActionFamily.TheCall }
        assertThat(call.actions).containsExactly(
            CallAction.Captions, CallAction.Recording, CallAction.AddPeople,
            CallAction.Journal, CallAction.React, CallAction.Capture,
        ).inOrder()
    }

    @Test
    fun `my image leads and the call trails`() {
        assertThat(CallActionFamily.MyImage.railSide).isEqualTo(CallRailSide.Leading)
        assertThat(CallActionFamily.TheCall.railSide).isEqualTo(CallRailSide.Trailing)
    }

    @Test
    fun `rows with the menu open unfold the two labelled rows in the pill`() {
        val rows = CallControlsDisposition.Rows.pillRows(actions(), CallScreenLayer.Menu)
        assertThat(families(rows)).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
        assertThat(CallControlsDisposition.Rows.unfoldsPill(CallScreenLayer.Menu)).isTrue()
    }

    @Test
    fun `rows never draw a rail over the grid`() {
        listOf(
            CallScreenLayer.Idle,
            CallScreenLayer.Menu,
            CallScreenLayer.Panel(CallScreenPanel.Journal),
            CallScreenLayer.Panel(CallScreenPanel.React),
            CallScreenLayer.Mode(CallScreenMode.Montage),
        ).forEach { assertThat(CallControlsDisposition.Rows.railRows(actions(), it)).isEmpty() }
    }

    @Test
    fun `rails never unfold the rows of the pill`() {
        listOf(
            CallScreenLayer.Idle,
            CallScreenLayer.Menu,
            CallScreenLayer.Panel(CallScreenPanel.Journal),
            CallScreenLayer.Panel(CallScreenPanel.People),
        ).forEach { assertThat(CallControlsDisposition.Rails.pillRows(actions(), it)).isEmpty() }
    }

    @Test
    fun `on rails the open menu does not make the pill grow`() {
        assertThat(CallControlsDisposition.Rails.unfoldsPill(CallScreenLayer.Menu)).isFalse()
        assertThat(CallControlsDisposition.Rails.unfoldsPill(CallScreenLayer.Idle)).isFalse()
    }

    @Test
    fun `an option drawn in the pill grows it in both dispositions`() {
        assertThat(CallControlsDisposition.Rails.unfoldsPill(CallScreenLayer.Panel(CallScreenPanel.React))).isTrue()
        assertThat(CallControlsDisposition.Rows.unfoldsPill(CallScreenLayer.Panel(CallScreenPanel.Record))).isTrue()
    }

    @Test
    fun `from two to three the open menu stays open and changes shape`() {
        val layer = CallScreenLayer.Idle.togglingMenu()
        val set = actions()
        val duo = CallControlsDisposition.resolve(participantCount = 2)
        val group = CallControlsDisposition.resolve(participantCount = 3)

        assertThat(families(duo.railRows(set, layer))).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
        assertThat(duo.pillRows(set, layer)).isEmpty()
        assertThat(families(group.pillRows(set, layer))).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
        assertThat(group.railRows(set, layer)).isEmpty()
        assertThat(layer.reconciled(set)).isEqualTo(CallScreenLayer.Menu)
    }

    @Test
    fun `from three to two a closed menu stays closed`() {
        val set = actions()
        assertThat(CallControlsDisposition.Rows.pillRows(set, CallScreenLayer.Idle)).isEmpty()
        assertThat(CallControlsDisposition.Rails.railRows(set, CallScreenLayer.Idle)).isEmpty()
    }

    @Test
    fun `every action appears exactly once in either disposition`() {
        val set = actions()
        val onRails = CallControlsDisposition.Rails.railRows(set, CallScreenLayer.Menu).flatMap { it.actions }
        val inRows = CallControlsDisposition.Rows.pillRows(set, CallScreenLayer.Menu).flatMap { it.actions }
        assertThat(onRails).containsExactlyElementsIn(inRows).inOrder()
        assertThat(onRails.toSet()).hasSize(onRails.size)
    }

    @Test
    fun `every rail button is a 48 dp target`() {
        assertThat(CallRailsLayout.BUTTON_SIDE_DP).isAtLeast(48f)
    }

    @Test
    fun `in portrait the rails stop above the pill`() {
        assertThat(CallRailsLayout.bottomClearance(containerWidthDp = 393f, safeHorizontalDp = 0f))
            .isEqualTo(CallRailsLayout.PILL_HEIGHT_DP + CallRailsLayout.PILL_GAP_DP)
    }

    @Test
    fun `in landscape the pill fits between the rails which reach the foot of the screen`() {
        assertThat(CallRailsLayout.bottomClearance(containerWidthDp = 844f, safeHorizontalDp = 48f)).isEqualTo(0f)
    }

    @Test
    fun `the leading rail leaves by the left edge and the trailing one by the right edge`() {
        assertThat(CallRailsLayout.slideOffset(CallRailSide.Leading, isRightToLeft = false, safeHorizontalDp = 0f)).isLessThan(0f)
        assertThat(CallRailsLayout.slideOffset(CallRailSide.Trailing, isRightToLeft = false, safeHorizontalDp = 0f)).isGreaterThan(0f)
    }

    @Test
    fun `right to left mirrors the edges`() {
        assertThat(CallRailsLayout.slideOffset(CallRailSide.Leading, isRightToLeft = true, safeHorizontalDp = 0f)).isGreaterThan(0f)
        assertThat(CallRailsLayout.slideOffset(CallRailSide.Trailing, isRightToLeft = true, safeHorizontalDp = 0f)).isLessThan(0f)
    }

    @Test
    fun `the slide clears the rail and the safe area completely`() {
        val travel = abs(CallRailsLayout.slideOffset(CallRailSide.Leading, isRightToLeft = false, safeHorizontalDp = 48f))
        assertThat(travel).isAtLeast(CallRailsLayout.RAIL_WIDTH_DP + CallRailsLayout.EDGE_INSET_DP + 48f)
    }

    @Test
    fun `both rails travel the same distance`() {
        val leading = CallRailsLayout.slideOffset(CallRailSide.Leading, isRightToLeft = false, safeHorizontalDp = 21f)
        val trailing = CallRailsLayout.slideOffset(CallRailSide.Trailing, isRightToLeft = false, safeHorizontalDp = 21f)
        assertThat(abs(leading)).isEqualTo(abs(trailing))
    }
}
