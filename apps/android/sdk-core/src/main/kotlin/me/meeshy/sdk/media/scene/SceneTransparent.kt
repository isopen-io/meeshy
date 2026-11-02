package me.meeshy.sdk.media.scene

import android.graphics.Bitmap

/** Ce qu'un calque pose quand il n'a rien à montrer : un pixel transparent, partagé, jamais libéré. */
internal object SceneTransparent {
    val pixel: Bitmap by lazy { Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888) }
}
