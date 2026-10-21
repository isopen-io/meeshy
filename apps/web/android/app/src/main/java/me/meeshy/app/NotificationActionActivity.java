package me.meeshy.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import java.util.Map;

/**
 * #11052 — le relais invisible des actions de banniere (« Repondre »,
 * « Ouvrir la carte », « Rejoindre », « Rappeler »), jumeau de
 * `sw-push.js` § notificationclick : le toucher note `opened` dans
 * l'entonnoir ({@link NotificationFunnelStore}) et retire la banniere, puis
 * ouvre la destination de l'action. Sans lui, seule la page comptait le
 * toucher du corps, et la carte laissait sa banniere dans le tiroir.
 *
 * Un relais d'ACTIVITE, pas un recepteur : Android 12 interdit d'ouvrir une
 * activite depuis le recepteur d'une notification. L'intention ne porte que
 * les cles que la ligne lit ({@link NotificationFunnelRules#lineExtras}).
 * Non exportee : seul un `PendingIntent` de l'app l'atteint.
 */
public class NotificationActionActivity extends Activity {

    private static final String TAG = "MeeshyBannerAction";
    private static final String EXTRA_IN_APP = "me.meeshy.app.banner.IN_APP";

    static Intent intentFor(Context context, NotificationBannerRules.Action action, Map<String, String> data) {
        Intent intent = new Intent(context, NotificationActionActivity.class)
            .setData(Uri.parse(action.link))
            .putExtra(EXTRA_IN_APP, action.inApp)
            .putExtra(NotificationBannerRules.EXTRA_BANNER_TAG, action.tag)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        for (Map.Entry<String, String> entry : NotificationFunnelRules.lineExtras(data).entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        if (intent != null) relay(intent);
        TrampolineExit.finishWithoutAnimation(this);
    }

    private void relay(Intent intent) {
        try {
            NotificationFunnelStore.noteOpened(this, NotificationFunnelRules.lineExtras(NotificationFunnelStore.extrasOf(intent.getExtras())));
        } catch (RuntimeException failure) {
            Log.w(TAG, "ouverture non notee", failure);
        }
        String tag = intent.getStringExtra(NotificationBannerRules.EXTRA_BANNER_TAG);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null && tag != null && !tag.isEmpty()) manager.cancel(tag, 0);
        Uri link = intent.getData();
        if (link == null) return;
        Intent target = intent.getBooleanExtra(EXTRA_IN_APP, false)
            ? new Intent(Intent.ACTION_VIEW, link, this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            : new Intent(Intent.ACTION_VIEW, link).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(target);
        } catch (ActivityNotFoundException absent) {
            Log.w(TAG, "aucune app pour ouvrir l'action", absent);
        }
    }
}
