package me.meeshy.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/**
 * #10626 — les contacts favoris : les conversations directes epinglees, comme
 * iOS. Quatre visages, huit quand le widget est assez haut ; le point de
 * presence n'apparait que si la page l'a servi.
 */
public class FavoriteContactsWidget extends MeeshyWidgetProvider {

    private static final int[] CELLS = {R.id.fav_0, R.id.fav_1, R.id.fav_2, R.id.fav_3, R.id.fav_4, R.id.fav_5, R.id.fav_6, R.id.fav_7};
    private static final int[] AVATARS = {
        R.id.fav_0_avatar, R.id.fav_1_avatar, R.id.fav_2_avatar, R.id.fav_3_avatar,
        R.id.fav_4_avatar, R.id.fav_5_avatar, R.id.fav_6_avatar, R.id.fav_7_avatar,
    };
    private static final int[] NAMES = {
        R.id.fav_0_name, R.id.fav_1_name, R.id.fav_2_name, R.id.fav_3_name,
        R.id.fav_4_name, R.id.fav_5_name, R.id.fav_6_name, R.id.fav_7_name,
    };
    private static final int TWO_ROWS_MIN_HEIGHT_DP = 200;

    @Override
    RemoteViews render(Context context, Bundle options, WidgetSnapshotRules.Snapshot snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_favorites);
        WidgetViews.header(views, context, R.string.widget_favorites_name, R.drawable.ic_widget_star, 0);
        views.setOnClickPendingIntent(R.id.widget_header, WidgetViews.open(context, WidgetActionRules.LIST_LINK));
        boolean tall = options != null && options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) >= TWO_ROWS_MIN_HEIGHT_DP;
        int slots = tall ? CELLS.length : CELLS.length / 2;
        int shown = Math.min(slots, snapshot.favorites.size());
        boolean empty = shown == 0;
        views.setViewVisibility(R.id.widget_empty, empty ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.fav_row_0, empty ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.fav_row_1, !empty && shown > CELLS.length / 2 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_empty, context.getString(
            snapshot.published ? R.string.widget_no_favorites : R.string.widget_signed_out));
        for (int i = 0; i < CELLS.length; i++) {
            if (i >= shown) {
                views.setViewVisibility(CELLS[i], i < CELLS.length / 2 ? View.INVISIBLE : View.GONE);
                continue;
            }
            WidgetSnapshotRules.Favorite favorite = snapshot.favorites.get(i);
            views.setViewVisibility(CELLS[i], View.VISIBLE);
            views.setImageViewBitmap(AVATARS[i], WidgetAvatars.avatar(context, favorite.avatar, favorite.initials,
                favorite.accent, WidgetSnapshotRules.presenceDot(favorite.presence), WidgetViews.AVATAR_PX));
            views.setTextViewText(NAMES[i], favorite.name);
            views.setContentDescription(CELLS[i], favorite.name);
            views.setOnClickPendingIntent(CELLS[i], WidgetViews.open(context, WidgetActionRules.conversationLink(favorite.id)));
        }
        return views;
    }
}
