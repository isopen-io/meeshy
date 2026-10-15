package me.meeshy.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

/**
 * #10626 — le socle des quatre widgets : ils ne lisent que l'instantane publie
 * par la page (`WidgetStore`), dans la langue choisie dans Meeshy
 * (`ShellLocale`), et se dessinent hors du fil principal — un visage peut
 * demander un telechargement.
 */
abstract class MeeshyWidgetProvider extends AppWidgetProvider {

    abstract RemoteViews render(Context context, Bundle options, WidgetSnapshotRules.Snapshot snapshot);

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, new int[] {id});
    }

    private void draw(Context context, AppWidgetManager manager, int[] ids) {
        PendingResult pending = goAsync();
        Context localized = ShellLocale.wrap(context.getApplicationContext());
        WidgetRefresher.WORK.execute(() -> {
            try {
                WidgetSnapshotRules.Snapshot snapshot = WidgetStore.load(localized);
                for (int id : ids) manager.updateAppWidget(id, render(localized, manager.getAppWidgetOptions(id), snapshot));
            } finally {
                pending.finish();
            }
        });
    }
}
