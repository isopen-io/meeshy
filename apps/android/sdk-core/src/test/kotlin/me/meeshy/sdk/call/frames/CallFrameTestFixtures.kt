package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Color
import me.meeshy.sdk.model.call.frames.CallFrameArrangement
import me.meeshy.sdk.model.call.frames.CallFrameBackground
import me.meeshy.sdk.model.call.frames.CallFrameBorder
import me.meeshy.sdk.model.call.frames.CallFrameBorderKind
import me.meeshy.sdk.model.call.frames.CallFrameBucket
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameFont
import me.meeshy.sdk.model.call.frames.CallFrameLayout
import me.meeshy.sdk.model.call.frames.CallFrameLook
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFrameNameShow
import me.meeshy.sdk.model.call.frames.CallFrameNameStyle
import me.meeshy.sdk.model.call.frames.CallFrameNames
import me.meeshy.sdk.model.call.frames.CallFramePattern
import me.meeshy.sdk.model.call.frames.CallFramePatternKind
import me.meeshy.sdk.model.call.frames.CallFrameSlotShape
import me.meeshy.sdk.model.call.frames.CallFrameSlotStyle
import me.meeshy.sdk.model.call.frames.CallFrameTextSize
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallFrameTilt
import me.meeshy.sdk.model.call.frames.CallFrameTitle
import me.meeshy.sdk.model.call.frames.CallFrameTitlePlace
import me.meeshy.sdk.model.call.frames.CallFrameTitleSource
import me.meeshy.sdk.model.call.frames.CallFrameTone
import kotlin.math.abs

internal const val BACKGROUND_HEX = "#203040"
internal val BACKGROUND_PIXEL: Int = Color.parseColor(BACKGROUND_HEX)

internal fun testFrame(
    shape: CallFrameSlotShape = CallFrameSlotShape.RECT,
    tone: CallFrameTone = CallFrameTone.COLOR,
    pattern: CallFramePatternKind? = null,
    border: CallFrameBorderKind? = null,
    id: String = "test.frame.duo",
): CallFrameDesign = CallFrameDesign(
    id = id,
    motif = "test.frame",
    mood = CallFrameMood.SIGNATURE,
    name = "Test",
    bucket = CallFrameBucket.DUO,
    look = CallFrameLook(
        layout = CallFrameLayout(CallFrameArrangement.SPLIT, margin = 0.04, gap = 0.02, top = 0.1, bottom = 0.1),
        slot = CallFrameSlotStyle(
            shape = shape, radius = null, stroke = null, double = false, glow = null, shadow = false, card = null,
            tilt = CallFrameTilt.NONE, tone = tone, duotone = null,
        ),
        background = CallFrameBackground.Solid(BACKGROUND_HEX),
        pattern = pattern?.let { CallFramePattern(it, "#FFFFFF", 0.5) },
        border = border?.let { CallFrameBorder(it, "#FFD700", 0.02, 0.01) },
        ornaments = emptyList(),
        names = CallFrameNames(CallFrameNameShow.NONE, CallFrameNameStyle.CAPTION, CallFrameFont.BOLD, "#FFFFFF", null),
        title = CallFrameTitle(
            CallFrameTitleSource.NONE, CallFrameFont.BOLD, "#FFFFFF", CallFrameTitlePlace.TOP, CallFrameTextSize.M, null, null,
        ),
        subtitle = null,
    ),
)

internal fun testTexts(date: String = "22 oct.") =
    CallFrameTexts(groupName = null, isGroup = false, date = date, accentHex = null)

internal fun solid(color: Int, size: Int = 16): Bitmap =
    Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).apply { eraseColor(color) }

internal fun portrait(id: String, name: String = "Ada", image: Bitmap? = null) =
    CallFramePortrait(id = id, name = name, handle = null, isSelf = false, image = image)

internal fun channelDistance(a: Int, b: Int): Int =
    maxOf(abs(Color.red(a) - Color.red(b)), abs(Color.green(a) - Color.green(b)), abs(Color.blue(a) - Color.blue(b)))

/** La part moyenne (0…1) dont deux images de même taille diffèrent, canal par canal. */
internal fun meanDifference(a: Bitmap, b: Bitmap): Double {
    require(a.width == b.width && a.height == b.height)
    var total = 0L
    for (y in 0 until a.height) {
        for (x in 0 until a.width) {
            val p = a.getPixel(x, y)
            val q = b.getPixel(x, y)
            total += abs(Color.red(p) - Color.red(q)) + abs(Color.green(p) - Color.green(q)) + abs(Color.blue(p) - Color.blue(q))
        }
    }
    return total.toDouble() / (a.width.toDouble() * a.height * 3 * 255)
}

/** Le nombre de pixels qui diffèrent nettement entre deux images de même taille. */
internal fun changedPixels(a: Bitmap, b: Bitmap, threshold: Int = 8): Int {
    var count = 0
    for (y in 0 until a.height) {
        for (x in 0 until a.width) {
            if (channelDistance(a.getPixel(x, y), b.getPixel(x, y)) > threshold) count++
        }
    }
    return count
}
