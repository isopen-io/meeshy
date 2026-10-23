package me.meeshy.sdk.model.composer

/** Les sélecteurs système que le composeur de conversation peut ouvrir. */
enum class ComposerPicker { PHOTO, CAMERA, FILE, GUEST_ATTACHMENT, LOCATION, CONTACT }

/** Ce qui occupe la place du clavier sous la barre — une seule surface à la fois. */
enum class ComposerInputSurface { NONE, KEYBOARD, ATTACHMENT_PANEL, EMOJI_PANEL }

/**
 * Le message en cours d'édition et le brouillon qu'on a quitté pour l'éditer ([draftBeforeEdit],
 * posé UNE fois, restitué à l'annulation — #4003).
 */
data class ComposerEditing(
    val messageId: String,
    val originalContent: String,
    val draftBeforeEdit: String,
)

/**
 * L'état du composeur de conversation, à la place des booléens dispersés — miroir d'iOS
 * `ConversationComposerState`. Il ne porte JAMAIS le texte (voir `ComposerTextState`) : une
 * frappe ne le change pas.
 */
data class ConversationComposerState(
    val inputSurface: ComposerInputSurface = ComposerInputSurface.NONE,
    val picker: ComposerPicker? = null,
    val pendingPlace: PendingPlace? = null,
    val selectedLanguage: String? = null,
    val replyToMessageId: String? = null,
    val replyPieceId: String? = null,
    val editing: ComposerEditing? = null,
    val isStickerSheetOpen: Boolean = false,
) {
    val isEditing: Boolean get() = editing != null
    val isKeyboardOrPanelShown: Boolean get() = inputSurface != ComposerInputSurface.NONE

    fun focusKeyboard(): ConversationComposerState = copy(inputSurface = ComposerInputSurface.KEYBOARD)

    fun toggleAttachmentPanel(): ConversationComposerState = copy(
        inputSurface = if (inputSurface == ComposerInputSurface.ATTACHMENT_PANEL) {
            ComposerInputSurface.NONE
        } else {
            ComposerInputSurface.ATTACHMENT_PANEL
        },
    )

    fun toggleEmojiPanel(): ConversationComposerState = copy(
        inputSurface = if (inputSurface == ComposerInputSurface.EMOJI_PANEL) {
            ComposerInputSurface.NONE
        } else {
            ComposerInputSurface.EMOJI_PANEL
        },
    )

    fun dismissInputSurface(): ConversationComposerState = copy(inputSurface = ComposerInputSurface.NONE)

    /** Ouvrir un sélecteur replie la surface de saisie : un seul élément au premier plan. */
    fun openPicker(picker: ComposerPicker): ConversationComposerState =
        copy(picker = picker, inputSurface = ComposerInputSurface.NONE, isStickerSheetOpen = false)

    fun closePicker(): ConversationComposerState = copy(picker = null)

    fun openStickerSheet(): ConversationComposerState =
        copy(isStickerSheetOpen = true, inputSurface = ComposerInputSurface.NONE)

    fun closeStickerSheet(): ConversationComposerState = copy(isStickerSheetOpen = false)

    fun withPlace(place: PendingPlace?): ConversationComposerState =
        copy(pendingPlace = place?.takeIf { it.isValid })

    fun withLanguage(code: String?): ConversationComposerState = copy(selectedLanguage = code)

    fun beginReply(messageId: String, pieceId: String? = null): ConversationComposerState =
        copy(replyToMessageId = messageId, replyPieceId = pieceId, inputSurface = ComposerInputSurface.KEYBOARD)

    fun cancelReply(): ConversationComposerState = copy(replyToMessageId = null, replyPieceId = null)

    /** Entrer en édition remplace une réponse en attente ; le brouillon courant n'est gardé qu'une fois. */
    fun beginEdit(messageId: String, originalContent: String, currentDraft: String): ConversationComposerState =
        copy(
            editing = ComposerEditing(
                messageId = messageId,
                originalContent = originalContent,
                draftBeforeEdit = editing?.draftBeforeEdit ?: currentDraft,
            ),
            replyToMessageId = null,
            replyPieceId = null,
            inputSurface = ComposerInputSurface.KEYBOARD,
        )

    fun endEdit(): ConversationComposerState = copy(editing = null)

    /** Ce que la conversation garde comme brouillon : en édition, ce qu'on composait avant. */
    fun persistedDraftText(composing: String): String =
        editing?.draftBeforeEdit ?: composing

    companion object {
        /** Plafond de sélection média (relevé de 10 à 199 côté iOS) : un seul message, une bulle par type. */
        const val MAX_MEDIA_SELECTION: Int = 199

        /** Les places encore libres pour [alreadyAttached] pièces. */
        fun remainingMediaSlots(alreadyAttached: Int): Int =
            (MAX_MEDIA_SELECTION - alreadyAttached).coerceAtLeast(0)
    }
}
