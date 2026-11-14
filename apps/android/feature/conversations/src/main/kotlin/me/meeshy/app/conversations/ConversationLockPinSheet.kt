package me.meeshy.app.conversations

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.lock.LockPinCopy
import me.meeshy.sdk.model.lock.LockPinError
import me.meeshy.sdk.model.lock.LockPinState
import me.meeshy.ui.component.lock.LockPinSheet
import me.meeshy.ui.component.lock.LockPinSheetTexts


/** Title string resource for a [LockPinCopy] — pure mapping the sheet renders. */
@StringRes
internal fun LockPinCopy.titleRes(): Int = when (this) {
    LockPinCopy.CREATE_MASTER_PIN -> R.string.conversations_lock_title_create_master
    LockPinCopy.CONFIRM_MASTER_PIN -> R.string.conversations_lock_title_confirm_master
    LockPinCopy.VERIFY_MASTER_PIN -> R.string.conversations_lock_title_verify_master
    LockPinCopy.ENTER_CODE -> R.string.conversations_lock_title_enter_code
    LockPinCopy.CONFIRM_CODE -> R.string.conversations_lock_title_confirm_code
    LockPinCopy.UNLOCK -> R.string.conversations_lock_title_unlock
    LockPinCopy.OPEN -> R.string.conversations_lock_title_open
    LockPinCopy.UNLOCK_ALL -> R.string.conversations_lock_title_unlock_all
    LockPinCopy.CHANGE_VERIFY_MASTER_PIN -> R.string.conversations_lock_title_verify_master
    LockPinCopy.NEW_MASTER_PIN -> R.string.conversations_lock_title_new_master
    LockPinCopy.CONFIRM_NEW_MASTER_PIN -> R.string.conversations_lock_title_confirm_new
    LockPinCopy.REMOVE_MASTER_PIN -> R.string.conversations_lock_title_remove_master
}

/** Whether a [LockPinCopy]'s subtitle interpolates the conversation name. */
internal fun LockPinCopy.subtitleTakesName(): Boolean = when (this) {
    LockPinCopy.ENTER_CODE, LockPinCopy.CONFIRM_CODE, LockPinCopy.UNLOCK, LockPinCopy.OPEN -> true
    else -> false
}

/** Un titre qui dit déjà tout (« Confirmer… », « Supprimer… ») n'a pas de sous-titre. */
@StringRes
internal fun LockPinCopy.subtitleRes(): Int? = when (this) {
    LockPinCopy.CREATE_MASTER_PIN -> R.string.conversations_lock_subtitle_create_master
    LockPinCopy.VERIFY_MASTER_PIN -> R.string.conversations_lock_subtitle_verify_master
    LockPinCopy.ENTER_CODE -> R.string.conversations_lock_subtitle_enter_code
    LockPinCopy.CONFIRM_CODE -> R.string.conversations_lock_subtitle_confirm_code
    LockPinCopy.UNLOCK -> R.string.conversations_lock_subtitle_unlock
    LockPinCopy.OPEN -> R.string.conversations_lock_subtitle_open
    LockPinCopy.UNLOCK_ALL -> R.string.conversations_lock_subtitle_unlock_all
    LockPinCopy.CHANGE_VERIFY_MASTER_PIN -> R.string.conversations_lock_subtitle_change_verify
    LockPinCopy.NEW_MASTER_PIN -> R.string.conversations_lock_subtitle_new_master
    LockPinCopy.CONFIRM_MASTER_PIN, LockPinCopy.CONFIRM_NEW_MASTER_PIN, LockPinCopy.REMOVE_MASTER_PIN -> null
}

@StringRes
private fun LockPinError.messageRes(): Int = when (this) {
    LockPinError.MASTER_PIN_INCORRECT -> R.string.conversations_lock_error_master_incorrect
    LockPinError.PIN_MISMATCH -> R.string.conversations_lock_error_pin_mismatch
    LockPinError.CODE_MISMATCH -> R.string.conversations_lock_error_code_mismatch
    LockPinError.CODE_INCORRECT -> R.string.conversations_lock_error_code_incorrect
}

/**
 * La feuille de code de verrou de conversation : resout les libelles de [prompt] puis delegue le rendu a la feuille
 * partagee [LockPinSheet] (:sdk-ui). Publique pour que la porte du fil (:app) la reutilise telle quelle.
 */
@Composable
fun ConversationLockPinSheet(
    prompt: LockPinState,
    conversationName: String,
    onDigit: (Int) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val copy = prompt.copy
    val texts = LockPinSheetTexts(
        title = stringResource(copy.titleRes()),
        subtitle = copy.subtitleRes()?.let { res ->
            if (copy.subtitleTakesName()) stringResource(res, conversationName) else stringResource(res)
        }.orEmpty(),
        errorText = prompt.error?.let { stringResource(it.messageRes()) },
        dotsDescription = stringResource(R.string.conversations_lock_dots_a11y, prompt.filledCount, prompt.pinLength),
        deleteDescription = stringResource(R.string.conversations_lock_delete_digit),
    )
    LockPinSheet(
        texts = texts,
        filledCount = prompt.filledCount,
        pinLength = prompt.pinLength,
        opensLock = copy == LockPinCopy.UNLOCK || copy == LockPinCopy.UNLOCK_ALL || copy == LockPinCopy.REMOVE_MASTER_PIN,
        onDigit = onDigit,
        onDelete = onDelete,
        onDismiss = onDismiss,
    )
}
