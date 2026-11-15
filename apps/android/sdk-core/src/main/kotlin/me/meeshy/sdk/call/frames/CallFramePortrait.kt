package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import me.meeshy.sdk.model.call.frames.CallFramePerson

/**
 * Une personne à peindre : son identité (celle qu'on voit déjà dans l'appel) et l'image de sa caméra.
 * `image == null` (caméra coupée) ⇒ un dégradé propre à la personne et son initiale, jamais une case
 * retirée. Jamais en miroir.
 */
class CallFramePortrait(
    val id: String,
    val name: String,
    val handle: String?,
    val isSelf: Boolean,
    val image: Bitmap?,
) {
    val person: CallFramePerson get() = CallFramePerson(id = id, name = name, handle = handle, isSelf = isSelf)

    /** L'image n'est exploitable que si elle a une surface et n'a pas été recyclée. */
    val hasImage: Boolean get() = image != null && !image.isRecycled && image.width > 0 && image.height > 0
}
