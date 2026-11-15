package me.meeshy.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.net.HttpURLConnection;
import java.net.URI;

/**
 * « Refuser » de la notification d'appel (#8049, C11), application tuee
 * comprise. Trois devoirs, modele `DeclineCallReceiver` du Kotlin gele :
 *
 * 1. couper la sonnerie — retirer la notification ;
 * 2. taire une redelivrance — l'appel entre au registre ({@link CallRingLedger}) ;
 * 3. prevenir l'APPELANT, sans quoi il sonne 60 s dans le vide — sans page ni
 *    socket, par `DELETE /api/v1/calls/:callId?reason=rejected`, la route que
 *    le service worker web appelle deja (`public/sw-push.js` § refuserAppel),
 *    avec le credential que la page a pose ({@link CallShellStore}).
 *
 * Un refus manque (pas de credential, reseau coupe) laisse l'appelant sonner
 * jusqu'a la fin de sa sonnerie : l'etat d'avant ce lot, jamais pire.
 */
public class DeclineCallReceiver extends BroadcastReceiver {

    private static final String TAG = "MeeshyDeclineCall";
    private static final int TIMEOUT_MS = 8_000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String callId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID);
        if (callId == null || callId.trim().isEmpty()) return;
        IncomingCallNotifier.dismiss(context, callId);
        CallShellStore.silence(context, callId);

        String url = CallShellRules.declineUrl(CallShellStore.apiBase(context), callId);
        String[] header = CallShellStore.credentialHeader(context);
        if (url == null || header == null) return;

        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                decline(url, header);
            } finally {
                pending.finish();
            }
        }, "meeshy-decline-call").start();
    }

    private static void decline(String url, String[] header) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
            connection.setRequestMethod("DELETE");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty(header[0], header[1]);
            int status = connection.getResponseCode();
            if (status >= 400) Log.w(TAG, "refus d'appel rendu " + status);
        } catch (Exception failure) {
            Log.w(TAG, "refus d'appel non remis", failure);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
