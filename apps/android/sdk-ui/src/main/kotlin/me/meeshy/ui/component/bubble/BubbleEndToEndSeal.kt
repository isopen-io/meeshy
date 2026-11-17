package me.meeshy.ui.component.bubble

import androidx.annotation.StringRes
import me.meeshy.sdk.model.EndToEndSeal
import me.meeshy.ui.R

/**
 * Ce que dit une bulle chiffrée de bout en bout que CET appareil ne montre pas (#18983) : un libellé VRAI par cas, le même
 * dans le fil, la rangée plate et la Rivière.
 */
public object BubbleEndToEndSeal {
    @StringRes
    fun label(seal: EndToEndSeal): Int = when (seal) {
        EndToEndSeal.PENDING -> R.string.bubble_message_end_to_end
        EndToEndSeal.UNREADABLE -> R.string.bubble_message_end_to_end_unreadable
        EndToEndSeal.UPDATE_REQUIRED -> R.string.bubble_message_end_to_end_update
        EndToEndSeal.OTHER_DEVICE -> R.string.bubble_message_end_to_end_other_device
    }
}
