package me.meeshy.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;

/** #10626 — les conversations recentes, epinglees d'abord ; chaque ligne s'ouvre ou se marque lue. */
public class RecentConversationsWidget extends MeeshyWidgetProvider {

    @Override
    RemoteViews render(Context context, Bundle options, WidgetSnapshotRules.Snapshot snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_recent);
        WidgetViews.header(views, context, R.string.widget_recent_name, R.drawable.ic_widget_chat, snapshot.unread);
        views.setOnClickPendingIntent(R.id.widget_header, WidgetViews.open(context, WidgetActionRules.LIST_LINK));
        Intent adapter = new Intent(context, RecentConversationsService.class);
        adapter.setData(Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, adapter);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);
        views.setTextViewText(R.id.widget_empty, context.getString(
            snapshot.published ? R.string.widget_no_conversations : R.string.widget_signed_out));
        views.setPendingIntentTemplate(R.id.widget_list, WidgetViews.rowTemplate(context));
        return views;
    }
}
