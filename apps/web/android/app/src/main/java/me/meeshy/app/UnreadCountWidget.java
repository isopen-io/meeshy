package me.meeshy.app;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

/** #10626 — le nombre de conversations non lues, hors muettes (le badge, D-L1). */
public class UnreadCountWidget extends MeeshyWidgetProvider {

    @Override
    RemoteViews render(Context context, Bundle options, WidgetSnapshotRules.Snapshot snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_unread);
        if (!snapshot.published) {
            views.setTextViewText(R.id.widget_count, "");
            views.setTextViewText(R.id.widget_label, context.getString(R.string.widget_signed_out));
        } else if (snapshot.unread > 0) {
            views.setTextViewText(R.id.widget_count, WidgetSnapshotRules.countLabel(snapshot.unread));
            views.setTextViewText(R.id.widget_label, context.getString(R.string.widget_unread_label));
        } else {
            views.setTextViewText(R.id.widget_count, "");
            views.setTextViewText(R.id.widget_label, context.getString(R.string.widget_all_read));
        }
        views.setOnClickPendingIntent(R.id.widget_root, WidgetViews.open(context, WidgetActionRules.LIST_LINK));
        return views;
    }
}
