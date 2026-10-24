package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameRect

public object CallFaceCrop {
    public fun pixelRect(box: CallFrameRect, imageSize: CallMontageCanvas): CallFrameRect = box
    public fun square(face: CallFrameRect?, imageSize: CallMontageCanvas, margin: Double): CallFrameRect = imageSize.bounds
}
