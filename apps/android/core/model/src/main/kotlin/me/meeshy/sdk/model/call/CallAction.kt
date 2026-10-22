package me.meeshy.sdk.model.call

/**
 * The family an action belongs to — where the call screen offers it.
 *
 *  - [Lifecycle] — answering, declining, retrying, closing: the controls of the
 *    ringing and ended screens.
 *  - [Base] — the row that is always under the thumb on a live call.
 *  - [MyImage] — what I send (camera, effects, screen share).
 *  - [TheCall] — what concerns the call itself (captions, reactions, people…).
 *
 * `MyImage` / `TheCall` mirror the iOS `CallActionFamily` (`myImage` / `theCall`).
 */
enum class CallActionFamily { Lifecycle, Base, MyImage, TheCall }

/**
 * The vocabulary of everything the call screen can offer the user. A control is
 * named once, here, and the same identifier travels everywhere (handler
 * registration, analytics, a future deep link) — so a gesture keeps one name on
 * every platform. The identifiers of the pill actions are the raw values of the
 * iOS `CallAction` (`CallControlsLayout.swift`); the base row and the lifecycle
 * controls are Android's own names for the iOS buttons that are not pill actions.
 *
 * Being listed here promises nothing: an action is *offered* only when a handler
 * is registered for it (see `CallActionDispatcher`), so a capability that has
 * not landed yet stays absent from the screen rather than inert.
 */
enum class CallAction(val id: String, val family: CallActionFamily) {
    Accept("accept", CallActionFamily.Lifecycle),
    Decline("decline", CallActionFamily.Lifecycle),
    Retry("retry", CallActionFamily.Lifecycle),
    Close("close", CallActionFamily.Lifecycle),

    Mute("mute", CallActionFamily.Base),
    AudioOutput("audioOutput", CallActionFamily.Base),
    HangUp("hangUp", CallActionFamily.Base),

    Camera("camera", CallActionFamily.MyImage),
    FlipCamera("flipCamera", CallActionFamily.MyImage),
    CameraPicker("cameraPicker", CallActionFamily.MyImage),
    Effects("effects", CallActionFamily.MyImage),
    ScreenShare("screenShare", CallActionFamily.MyImage),

    Captions("captions", CallActionFamily.TheCall),
    Recording("recording", CallActionFamily.TheCall),
    PictureInPicture("pictureInPicture", CallActionFamily.TheCall),
    AddPeople("addPeople", CallActionFamily.TheCall),
    React("react", CallActionFamily.TheCall),
    Capture("capture", CallActionFamily.TheCall),
    Journal("journal", CallActionFamily.TheCall),
    ;

    companion object {
        /** The action named [id], or `null` — an unknown or missing name is never guessed. */
        fun fromId(id: String?): CallAction? = id?.let { wanted -> entries.firstOrNull { it.id == wanted } }
    }
}
