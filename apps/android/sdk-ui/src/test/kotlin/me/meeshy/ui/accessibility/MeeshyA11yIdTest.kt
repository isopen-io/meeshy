package me.meeshy.ui.accessibility

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeshyA11yIdTest {
    @Test fun `les identifiants reprennent ceux d iOS`() {
        assertThat(MeeshyA11yId.LOGIN_SUBMIT).isEqualTo("login.submit")
        assertThat(MeeshyA11yId.COMPOSER_SEND).isEqualTo("composer.send")
        assertThat(MeeshyA11yId.COMPOSER_QUICK_EMOJI).isEqualTo("composer.quickEmoji")
        assertThat(MeeshyA11yId.COMPOSER_TEXT_STICKER).isEqualTo("composer.textSticker")
        assertThat(MeeshyA11yId.COMPOSER_TEXT_STICKER_SHEET).isEqualTo("composer.textSticker.sheet")
        assertThat(MeeshyA11yId.COMPOSER_TEXT_FIELD).isEqualTo("composer.textField")
        assertThat(MeeshyA11yId.CONVERSATION_MESSAGE_LIST).isEqualTo("conversation.messageList")
        assertThat(MeeshyA11yId.CONVERSATION_SCROLL_TO_BOTTOM).isEqualTo("conversation.scrollToBottom")
        assertThat(MeeshyA11yId.CONVERSATION_ROW).isEqualTo("conversation.row")
        assertThat(MeeshyA11yId.TOAST_CONTAINER).isEqualTo("toast.container")
        assertThat(MeeshyA11yId.CALL_CONTROL_END).isEqualTo("call.control.end")
        assertThat(MeeshyA11yId.CALL_CONTROL_ANSWER).isEqualTo("call.control.answer")
        assertThat(MeeshyA11yId.CALL_CONTROL_DECLINE).isEqualTo("call.control.decline")
        assertThat(MeeshyA11yId.CALL_CONTROL_MUTE).isEqualTo("call.control.mute")
        assertThat(MeeshyA11yId.CALL_CONTROL_SPEAKER).isEqualTo("call.control.speaker")
        assertThat(MeeshyA11yId.JOIN_SUBMIT).isEqualTo("join.submit")
        assertThat(MeeshyA11yId.COMMUNITY_CREATE_SUBMIT).isEqualTo("community.create.submit")
    }
}
