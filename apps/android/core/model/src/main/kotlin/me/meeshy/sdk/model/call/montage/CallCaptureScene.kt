package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFramePerson

/** Ce qui se peint : un montage classique, ou un cadre du catalogue — miroir de `CallCaptureLook` (iOS). */
public sealed interface CallCaptureLook {
    public data class Classic(val style: CallMontageStyle) : CallCaptureLook
    public data class Frame(val design: CallFrameDesign) : CallCaptureLook
}

/**
 * Une personne de l'appel pour la capture, miroir de `CallCaptureSubject` (iOS) : son identité, si son
 * image se retourne (ma caméra avant, comme je me vois) et si elle a une image (caméra coupée ⇒ sa case
 * garde l'initiale).
 */
public data class CallCaptureSubject(
    val id: String,
    val name: String,
    val handle: String?,
    val isSelf: Boolean,
    val isMirrored: Boolean,
    val showsVideo: Boolean,
)

/** Ce que la capture peint : quel rendu, et qui. */
public data class CallCaptureScene(
    val look: CallCaptureLook,
    val subjects: List<CallCaptureSubject>,
)

/**
 * **CE QUE LA CAPTURE D'UN APPEL PEINT** — `CallCaptureController.captureLook` et les sujets d'iOS : le
 * cadre appliqué (sa variante pour ce nombre), sinon l'Écran classique, le choix par défaut d'iOS.
 */
public object CallCaptureSceneRule {
    public val DEFAULT_STYLE: CallMontageStyle = CallMontageStyle.SCREEN

    public fun look(frameId: String?, people: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallCaptureLook {
        val classic = CallCaptureLook.Classic(DEFAULT_STYLE)
        if (frameId == null) return classic
        val reconciled = CallMontageFrameRule.reconcile(CallMontageChoice.Frame(frameId), people, among)
        val id = (reconciled as? CallMontageChoice.Frame)?.id ?: return classic
        return CallMontageFrameRule.design(id, among)?.let { CallCaptureLook.Frame(it) } ?: classic
    }

    /** Un duo, dans l'ordre des personnes : moi (en miroir sur la caméra avant), puis l'autre, à l'endroit. */
    public fun duo(
        people: List<CallFramePerson>,
        isCameraOn: Boolean,
        isFrontCamera: Boolean,
        isPeerCameraOff: Boolean,
    ): List<CallCaptureSubject> = people.map { person ->
        CallCaptureSubject(
            id = person.id,
            name = person.name,
            handle = person.handle,
            isSelf = person.isSelf,
            isMirrored = person.isSelf && isFrontCamera,
            showsVideo = if (person.isSelf) isCameraOn else !isPeerCameraOff,
        )
    }
}

/** Les mesures de la capture : celles d'iOS (`CallMontageLayout.captureSize`, `recordingCanvas`, 15 i/s). */
public object CallCaptureSpec {
    public const val PHOTO_WIDTH: Int = 1080
    public const val PHOTO_HEIGHT: Int = 1920
    public const val VIDEO_WIDTH: Int = 720
    public const val VIDEO_HEIGHT: Int = 1280
    public const val VIDEO_FRAME_INTERVAL_MILLIS: Long = 66L
    public const val VIDEO_MAX_DIMENSION: Int = 640
    public const val JPEG_QUALITY: Int = 92

    public fun photoName(stamp: String): String = "${CallMontageCaption.BRAND_TITLE}-$stamp.jpg"

    public fun videoName(stamp: String): String = "${CallMontageCaption.BRAND_TITLE}-$stamp.mp4"
}
