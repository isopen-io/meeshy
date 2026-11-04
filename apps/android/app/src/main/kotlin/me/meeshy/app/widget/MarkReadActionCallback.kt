package me.meeshy.app.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.updateAll
import dagger.hilt.android.EntryPointAccessors

/**
 * Le tap sur la coche d'une ligne non lue : ne lance pas l'app, marque la conversation lue puis
 * redessine les widgets. Les trois paliers (cache, outbox, repeinte) vivent dans [MarkReadWidgetAction].
 */
internal class MarkReadActionCallback : ActionCallback {

    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val conversationId = parameters[MarkReadParameters.conversationId] ?: return
        val entryPoint = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java)
        val action = MarkReadWidgetAction(
            port = RepositoryWidgetReadPort(entryPoint.conversationRepository()),
            isSignedIn = { !entryPoint.tokenStore().userId.isNullOrBlank() },
        )
        action.run(conversationId)
        RecentConversationsWidget().updateAll(context)
        UnreadCountWidget().updateAll(context)
    }
}

internal object MarkReadParameters {
    val conversationId: androidx.glance.action.ActionParameters.Key<String> =
        androidx.glance.action.ActionParameters.Key("conversationId")
}
