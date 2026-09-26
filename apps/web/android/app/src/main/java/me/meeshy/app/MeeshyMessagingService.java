package me.meeshy.app;

import android.util.Log;
import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.lang.reflect.Method;

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
 *   (`PushNotificationsPlugin.sendRemoteMessage` / `onNewToken`).
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
