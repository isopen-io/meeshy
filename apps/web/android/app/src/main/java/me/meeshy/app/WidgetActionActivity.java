package me.meeshy.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * #10626 — le relais invisible des lignes du widget des conversations : une
 * liste n'a qu'UN gabarit d'action pour toutes ses lignes, et une ligne porte
 * deux gestes. « Ouvrir » relance la coque sur le lien profond ; « marquer
 * lu » s'inscrit dans la file que la page videra au retour (le widget n'a pas
 * de jeton), et la ligne s'eteint tout de suite. Non exportee : seul un
 * `PendingIntent` de l'app l'atteint.
 */
public class WidgetActionActivity extends Activity {

    static final String EXTRA_ACTION = "me.meeshy.app.widget.ACTION";
    static final String EXTRA_CONVERSATION = "me.meeshy.app.widget.CONVERSATION";
    static final String OPEN = "open";
    static final String READ = "read";

    static Intent fillIn(String action, String conversationId) {
        return new Intent()
            .setData(Uri.parse(WidgetActionRules.conversationLink(conversationId) + (READ.equals(action) ? "#read" : "")))
            .putExtra(EXTRA_ACTION, action)
            .putExtra(EXTRA_CONVERSATION, conversationId);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        String conversationId = intent == null ? null : intent.getStringExtra(EXTRA_CONVERSATION);
        if (conversationId != null && !conversationId.isEmpty()) {
            if (READ.equals(intent.getStringExtra(EXTRA_ACTION))) {
                WidgetStore.queueMarkRead(this, conversationId);
                WidgetRefresher.refreshAll(this);
            } else {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetActionRules.conversationLink(conversationId)), this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        }
        TrampolineExit.finishWithoutAnimation(this);
    }
}
