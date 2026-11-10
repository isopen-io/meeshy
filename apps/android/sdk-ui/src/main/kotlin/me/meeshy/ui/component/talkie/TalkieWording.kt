package me.meeshy.ui.component.talkie

import androidx.annotation.StringRes
import me.meeshy.sdk.model.relation.TalkieHeaderDelivery
import me.meeshy.sdk.model.relation.TalkieSendOutcome
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.ui.R

/**
 * Les phrases du talkie émis (#17150, iso `ProfileTalkieWording` / `TalkieHeaderWording`), une ressource par sens — sept
 * langues adoptées du catalogue iOS (`i18n/manifest/sdk-ui.d/talkie-emettre-17150.json`).
 */
public object TalkieWording {

    /** Ce qu'une prise de parole qui n'a pas abouti dit : une information neutre pour le repli, une erreur sinon. */
    @StringRes
    public fun notice(outcome: TalkieSendOutcome): Int = when (outcome) {
        TalkieSendOutcome.VOICE -> R.string.talkie_send_voice_copy
        TalkieSendOutcome.NOT_ALLOWED -> R.string.talkie_send_voice
        TalkieSendOutcome.E2EE -> R.string.talkie_send_e2ee
        TalkieSendOutcome.RATE_LIMITED -> R.string.talkie_send_rate_limited
        TalkieSendOutcome.OFFLINE -> R.string.talkie_send_offline
        TalkieSendOutcome.FAILED -> R.string.talkie_send_failed
        TalkieSendOutcome.MIC_DENIED -> R.string.talkie_send_mic_denied
        TalkieSendOutcome.LIMIT -> R.string.talkie_send_limit
    }

    /** Le libellé du bouton de fiche, selon la phase ; ceux qui nomment l'autre prennent son nom en argument. */
    @StringRes
    public fun label(phase: TalkieSendPhase, waking: Boolean): Int = when (phase) {
        TalkieSendPhase.Idle -> R.string.talkie_send_hold
        is TalkieSendPhase.Starting -> R.string.talkie_send_connecting
        is TalkieSendPhase.Talking -> if (waking) R.string.talkie_send_waking else R.string.talkie_send_talking
        is TalkieSendPhase.RecordingCopy -> R.string.talkie_send_recording_copy
    }

    /** La valeur que TalkBack lit sur un bouton dont la voix part. */
    @StringRes
    public fun liveValue(phase: TalkieSendPhase, waking: Boolean): Int = when {
        phase is TalkieSendPhase.RecordingCopy -> R.string.talkie_send_recording_copy
        phase is TalkieSendPhase.Talking && waking -> R.string.talkie_send_waking
        else -> R.string.talkie_send_talking
    }

    @StringRes
    public fun badge(delivery: TalkieHeaderDelivery): Int = when (delivery) {
        TalkieHeaderDelivery.LIVE -> R.string.talkie_header_badge_live
        TalkieHeaderDelivery.RELAYED -> R.string.talkie_header_badge_relayed
        TalkieHeaderDelivery.RECORDED -> R.string.talkie_header_badge_recorded
    }

    @StringRes
    public fun announcement(delivery: TalkieHeaderDelivery): Int = when (delivery) {
        TalkieHeaderDelivery.LIVE -> R.string.talkie_header_announce_live
        TalkieHeaderDelivery.RELAYED -> R.string.talkie_header_announce_relayed
        TalkieHeaderDelivery.RECORDED -> R.string.talkie_header_announce_recorded
    }

    /** Les libellés qui portent le nom de l'autre (`%1$s`). */
    public fun takesName(@StringRes res: Int): Boolean =
        res == R.string.talkie_send_talking || res == R.string.talkie_send_waking
}
