package me.meeshy.app;

import android.util.Log;
import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * LE SEUL service `MESSAGING_EVENT` de la coque (#8049). FCM ne remet un
 * message qu'a UN service : celui du plugin `@capacitor/push-notifications`
 * est donc retire a la fusion du manifeste (`tools:node="remove"`), et
 * celui-ci fait les deux metiers :
 *
 * - une poussee d'APPEL (`type=call`, data-only, app tuee comprise) pose la
 *   notification plein ecran ; `call_cancel` / `call_answered_elsewhere` la
 *   retirent ({@link CallPush}) ;
 * - TOUT le reste — et le renouvellement du jeton — est remis INCHANGE au
 *   plugin, exactement ce que faisait son propre service
 *   (`PushNotificationsPlugin.sendRemoteMessage` / `onNewToken`) ; et une
 *   ARRIVEE de message y accuse sa remise ({@link PushDeliveryReceipt}, #8124),
 *   comme le service worker web et la NSE iOS.
 *
 * Le plugin est atteint par reflexion, pas par heritage : `cap sync` ne
 * synchronise que `dependencies` et `devDependencies`, et le plugin est
 * declare en `optionalDependencies` de `apps/web/package.json` — il peut donc
 * manquer a la construction. Heriter de sa classe ferait echouer la
 * compilation de la coque dans ce cas ; la reflexion degrade en « rien a
 * remettre », ce qui est exactement l'etat d'une coque sans le plugin.
 */
public class MeeshyMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MeeshyMessaging";
    private static final String PLUGIN = "com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin";
    private static final int TIMEOUT_MS = 8_000;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);
        CallPush push = CallPush.route(
            message.getData(),
            MainActivity.isInForeground(),
            CallShellStore.ledger(this),
            System.currentTimeMillis()
        );
        switch (push.kind) {
            case RING:
                CallShellStore.silence(this, push.callId);
                IncomingCallNotifier.show(this, push);
                return;
            case STOP:
                CallShellStore.silence(this, push.callId);
                IncomingCallNotifier.dismiss(this, push.callId);
                return;
            case SUPPRESS:
                return;
            default:
                forward("sendRemoteMessage", RemoteMessage.class, message);
                acknowledgeDelivery(message);
        }
    }

    /**
     * Best-effort, comme `sw-push.js` : un accuse manque (pas de credential,
     * reseau coupe) laisse le message « envoye » jusqu'a la reconnexion — l'etat
     * d'avant #8124, jamais pire. `onMessageReceived` tourne deja hors du fil
     * principal : l'appel reseau y est permis.
     */
    private void acknowledgeDelivery(RemoteMessage message) {
        PushDeliveryReceipt receipt = PushDeliveryReceipt.of(message.getData(), CallShellStore.apiBase(this));
        String[] header = CallShellStore.credentialHeader(this);
        if (receipt == null || header == null) return;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) URI.create(receipt.url).toURL().openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty(header[0], header[1]);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(receipt.body.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            if (status >= 400) Log.w(TAG, "accuse de remise rendu " + status);
        } catch (Exception failure) {
            Log.w(TAG, "accuse de remise non remis", failure);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        forward("onNewToken", String.class, token);
    }

    private static void forward(String method, Class<?> type, Object argument) {
        try {
            Method target = Class.forName(PLUGIN).getMethod(method, type);
            target.invoke(null, argument);
        } catch (ClassNotFoundException absent) {
            Log.d(TAG, "plugin de notifications absent de la coque : rien a remettre");
        } catch (ReflectiveOperationException | RuntimeException failure) {
            Log.w(TAG, "remise au plugin de notifications impossible", failure);
        }
    }
}
