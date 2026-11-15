package me.meeshy.app.push.pipeline

import android.content.Context
import me.meeshy.app.R
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.PushProtectedPlaceholder
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.model.push.PushPresentationLabels
import me.meeshy.sdk.model.push.PushPresentationText

/**
 * Compose ce que la bannière DIT : substitut localisé d'un message protégé, puis réglages Aperçu / Nom, titre
 * « Nom dans Groupe » et vocal vide. Rend un push dont `notificationTitle` / `notificationBody` sont les textes finals,
 * que tous les enrichisseurs lisent ensuite — le corps servi (Prisme déjà résolu) n'est jamais retraduit.
 */
internal object PushBannerText {

    fun apply(context: Context, push: IncomingPush, preferences: UserNotificationPreferences): IncomingPush {
        val payload = push.payload
        if (!PushPresentationText.concerns(payload)) return push
        val served = push.notificationBody ?: payload.body
        val body = PushProtectedPlaceholder.text(context, payload.notificationLocKey) ?: served
        val labels = PushPresentationLabels(
            newMessage = context.getString(R.string.push_new_message),
            someone = context.getString(R.string.push_someone),
            voiceMessage = context.getString(R.string.push_voice_message),
            senderInGroup = context.getString(R.string.push_sender_in_group),
        )
        val shown = PushPresentationText.present(payload, push.notificationTitle ?: payload.title, body, preferences, labels)
        return push.copy(notificationTitle = shown.title, notificationBody = shown.body)
    }
}
