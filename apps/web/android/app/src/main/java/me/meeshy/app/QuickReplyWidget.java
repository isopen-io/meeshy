package me.meeshy.app;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/**
 * #10626 — la reponse rapide : la premiere conversation non lue (sinon la
 * plus recente). Android ne saisit pas dans un widget : « Repondre » ouvre le
 * fil, composeur focalise (`?compose=1`, `compose-focus.ts`).
 */
public class QuickReplyWidget extends MeeshyWidgetProvider {

    @Override
    RemoteViews render(Context context, Bundle options, WidgetSnapshotRules.Snapshot snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_reply);
        WidgetViews.header(views, context, R.string.widget_quick_reply_name, R.drawable.ic_widget_reply, 0);
        WidgetSnapshotRules.Row target = WidgetSnapshotRules.quickReplyTarget(snapshot);
        views.setViewVisibility(R.id.widget_content, target == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_empty, target == null ? View.VISIBLE : View.GONE);
        if (target == null) {
            views.setTextViewText(R.id.widget_empty, context.getString(
                snapshot.published ? R.string.widget_nothing_to_reply : R.string.widget_signed_out));
            views.setOnClickPendingIntent(R.id.widget_empty, WidgetViews.open(context, WidgetActionRules.LIST_LINK));
            return views;
        }
        WidgetViews.conversation(views, context, target);
        views.setTextViewText(R.id.widget_reply, context.getString(R.string.widget_reply));
        views.setOnClickPendingIntent(R.id.widget_content, WidgetViews.open(context, WidgetActionRules.conversationLink(target.id)));
        views.setOnClickPendingIntent(R.id.widget_reply, WidgetViews.open(context, WidgetActionRules.replyLink(target.id)));
        return views;
    }
}
