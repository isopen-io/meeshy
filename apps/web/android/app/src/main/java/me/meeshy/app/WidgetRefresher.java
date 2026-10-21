package me.meeshy.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * #10626 — redessine les widgets poses apres une publication de la page ou
 * une action faite depuis un widget. Les rendus (et le telechargement des
 * visages) passent par UN executeur, hors du fil principal.
 */
final class WidgetRefresher {

    static final ExecutorService WORK = Executors.newSingleThreadExecutor();

    private static final Class<?>[] PROVIDERS = {
        UnreadCountWidget.class, RecentConversationsWidget.class, QuickReplyWidget.class, FavoriteContactsWidget.class,
    };

    private WidgetRefresher() {}

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> provider : PROVIDERS) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
            if (ids.length == 0) continue;
            context.sendBroadcast(new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .setClass(context, provider)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids));
            if (provider == RecentConversationsWidget.class) reloadRows(manager, ids);
        }
    }

    // Le pendant de RecentConversationsWidget#bindRows : la liste est servie par
    // RecentConversationsService, que seul cet appel fait relire.
    @SuppressWarnings("deprecation")
    private static void reloadRows(AppWidgetManager manager, int[] ids) {
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }
}
