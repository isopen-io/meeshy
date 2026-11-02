package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import me.meeshy.sdk.model.call.frames.CallFrameDensity
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameOrnament
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentKind
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentMotion

internal fun ornament(
    kind: CallFrameOrnamentKind,
    layer: CallFrameLayer = CallFrameLayer.BACK,
    motion: CallFrameOrnamentMotion = CallFrameOrnamentMotion.STILL,
    density: CallFrameDensity = CallFrameDensity.MID,
) = CallFrameOrnament(kind, "#FFD27A", density, layer, motion)

internal fun framed(vararg ornaments: CallFrameOrnament): CallFrameDesign {
    val base = testFrame()
    return base.copy(look = base.look.copy(ornaments = ornaments.toList()))
}

internal fun renderWith(
    frame: CallFrameDesign,
    painter: CallFrameExtraPainter,
    width: Int = 216,
    height: Int = 384,
): Bitmap {
    val faces = listOf(portrait("p1", image = solid(android.graphics.Color.RED)), portrait("p2", image = solid(android.graphics.Color.RED)))
    return requireNotNull(CallFrameRenderer.render(frame, faces, testTexts(), width, height, extras = painter)) { "rendu nul" }
}

internal fun sameBitmap(a: Bitmap, b: Bitmap): Boolean = a.sameAs(b)
