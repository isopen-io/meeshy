package me.meeshy.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.text.format.DateFormat;
import android.text.format.DateUtils;
import android.view.View;
import android.widget.RemoteViews;

/**
 * #10626 — ce que les quatre widgets partagent : l'ouverture par lien profond,
 * l'en-tete, l'heure d'une ligne, et la ligne de conversation elle-meme.
 */
final class WidgetViews {

    static final int AVATAR_PX = 120;

    private WidgetViews() {}

    /** Un toucher ouvre la coque sur `link` — `MeeshyLinksPlugin` le relaie au routeur. */
    static PendingIntent open(Context context, String link) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Le gabarit des lignes d'une liste : chaque ligne y ajoute son action. */
    static PendingIntent rowTemplate(Context context) {
        Intent intent = new Intent(context, WidgetActionActivity.class);
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT | mutable);
    }

    static void header(RemoteViews views, Context context, int titleRes, int iconRes, int count) {
        views.setTextViewText(R.id.widget_title, context.getString(titleRes));
        views.setImageViewResource(R.id.widget_header_icon, iconRes);
        views.setViewVisibility(R.id.widget_header_badge, count > 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_header_badge, WidgetSnapshotRules.countLabel(count));
    }

    static String time(Context context, long at) {
        if (at < 0) return "";
        if (DateUtils.isToday(at)) return DateFormat.getTimeFormat(context).format(at);
        return DateUtils.formatDateTime(context, at, DateUtils.FORMAT_SHOW_DATE | DateUtils.FORMAT_ABBREV_MONTH | DateUtils.FORMAT_NO_YEAR);
    }

    /** Visage, nom, heure, apercu — la ligne commune a la liste et a la reponse rapide. */
    static void conversation(RemoteViews views, Context context, WidgetSnapshotRules.Row row) {
        views.setImageViewBitmap(R.id.row_avatar, WidgetAvatars.avatar(context, row.avatar, row.initials, row.accent, null, AVATAR_PX));
        views.setTextViewText(R.id.row_name, row.name);
        views.setTextViewText(R.id.row_time, time(context, row.at));
        views.setTextViewText(R.id.row_preview, row.preview);
    }
}
