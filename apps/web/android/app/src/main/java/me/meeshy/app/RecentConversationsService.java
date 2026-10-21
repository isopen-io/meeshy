package me.meeshy.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;

/**
 * #10626 — les lignes du widget des conversations recentes. La fabrique
 * tourne sur un fil du systeme, pas le fil principal : c'est la que les
 * visages se telechargent.
 */
public class RecentConversationsService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(ShellLocale.wrap(getApplicationContext()));
    }

    private static final class Rows implements RemoteViewsFactory {
        private final Context context;
        private List<WidgetSnapshotRules.Row> rows = new ArrayList<>();

        Rows(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            rows = new ArrayList<>(WidgetStore.load(context).conversations);
        }

        @Override
        public void onDestroy() {
            rows = new ArrayList<>();
        }

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_recent_row);
            if (position >= rows.size()) return views;
            WidgetSnapshotRules.Row row = rows.get(position);
            WidgetViews.conversation(views, context, row);
            boolean unread = row.unread > 0;
            views.setViewVisibility(R.id.row_badge, unread ? View.VISIBLE : View.GONE);
            views.setTextViewText(R.id.row_badge, WidgetSnapshotRules.countLabel(row.unread));
            views.setViewVisibility(R.id.row_mark_read, unread ? View.VISIBLE : View.GONE);
            views.setContentDescription(R.id.row_mark_read, context.getString(R.string.widget_mark_read) + " — " + row.name);
            views.setOnClickFillInIntent(R.id.row, WidgetActionActivity.fillIn(WidgetActionActivity.OPEN, row.id));
            views.setOnClickFillInIntent(R.id.row_mark_read, WidgetActionActivity.fillIn(WidgetActionActivity.READ, row.id));
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position < rows.size() ? rows.get(position).id.hashCode() : position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
