package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * LE SEUL service `MESSAGING_EVENT` de la coque (#8049). FCM ne remet un
 * message qu'a UN service : celui du plugin `@capacitor/push-notifications`
 * est donc retire a la fusion du manifeste (`tools:node="remove"`), et
 * celui-ci fait les deux metiers :
 *
 * - une poussee d'APPEL (`type=call`, data-only, app tuee comprise) pose la
 *   notification plein ecran ; `call_cancel` / `call_answered_elsewhere` la
 *   retirent ({@link CallPush}) ;
 * - une REVOCATION (`notification_revoked`, #8624) retire les bannieres que
 *   FCM a posees ({@link NotificationRevocation}) et ne va pas au plugin ;
 * - TOUT le reste — et le renouvellement du jeton — est remis INCHANGE au
 *   plugin, exactement ce que faisait son propre service
 *   (`PushNotificationsPlugin.sendRemoteMessage` / `onNewToken`) ; et une
 *   ARRIVEE de message y accuse sa remise ({@link PushDeliveryReceipt}, #8124),
 *   comme le service worker web et la NSE iOS — app fermee, c'est
 *   `handleIntent` qui l'accuse, FCM affichant la banniere sans
 *   `onMessageReceived` (#11034) ;
 * - un VOCAL dont FCM vient d'afficher la banniere y gagne l'action
 *   « Ecouter » ({@link NotificationVoiceBanner}, #10641) ;
 * - une banniere que FCM affiche app fermee est notee « recue » et
 *   « affichee » dans l'entonnoir ({@link NotificationFunnelStore}, #10938) ;
 * - une CORRECTION (message edite) n'est affichee que si elle remplace sa
 *   propre banniere ({@link NotificationCorrectionRules}, #10989) ;
 * - une banniere que le systeme ne montrera pas (notifications coupees, canal
 *   desactive) n'est notee que « recue » (#11054) ;
 * - le total non lu que porte chaque push (`unreadCount`) redessine les
 *   widgets, banniere retenue ou non, comme `poserBadge` (`sw-push.js`) et la
 *   NSE iOS (#11080).
 *
 * Le plugin est atteint par reflexion, pas par heritage : `cap sync` ne
 * synchronise que `dependencies` et `devDependencies`, et le plugin est
 * declare en `optionalDependencies` de `apps/web/package.json` — il peut donc
 * manquer a la construction. Heriter de sa classe ferait echouer la
 * compilation de la coque dans ce cas ; la reflexion degrade en « rien a
 * remettre », ce qui est exactement l'etat d'une coque sans le plugin.
 */
public class MeeshyMessagingService extends FirebaseMessagingService {

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(ShellLocale.wrap(base));
    }

    private static final String TAG = "MeeshyMessaging";
    private static final String PLUGIN = "com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin";
    private static final int TIMEOUT_MS = 8_000;

    /**
     * #10641 — une banniere de message est affichee par FCM LUI-MEME, app
     * fermee (bloc `notification` de la charge) : `onMessageReceived` n'est
     * pas appele, et c'est le seul moment ou la coque voit passer ce push.
     * Une fois l'affichage fait par `super`, la banniere d'un vocal ecoutable
     * recoit son action ; tout autre push repart inchange.
     */
    @Override
    public void handleIntent(Intent intent) {
        Bundle extras = intent == null ? null : intent.getExtras();
        Map<String, String> data = NotificationFunnelStore.extrasOf(extras);
        boolean inForeground = MainActivity.isInForeground();
        boolean displayed = inForeground || !withheld(data);
        if (displayed) super.handleIntent(intent);
        try {
            NotificationFunnelStore.noteShown(this, data, inForeground, displayed && (inForeground || systemShows(data)));
        } catch (RuntimeException failure) {
            Log.w(TAG, "entonnoir de notification non note", failure);
        }
        if (displayed) {
            try {
                NotificationVoiceBanner.offer(this, NotificationVoiceBanner.payloadOf(extras));
            } catch (RuntimeException failure) {
                Log.w(TAG, "action d'ecoute non posee", failure);
            }
        }
        try {
            WidgetStore.notePushedUnread(this, WidgetSnapshotRules.unreadOf(data));
        } catch (RuntimeException failure) {
            Log.w(TAG, "total non lu des widgets non note", failure);
        }
        try {
            acknowledgeDelivery(PushDeliveryReceipt.ofDisplayedByFcm(data, inForeground, CallShellStore.apiBase(this)));
        } catch (RuntimeException failure) {
            Log.w(TAG, "accuse de remise non prepare", failure);
        }
    }

    /**
     * #10989 — une correction dont la banniere a ete balayee, ou remplacee par
     * un message plus recent du fil, ou qui dit deja ce texte : FCM ne
     * l'affiche pas. #12479 — un push livre deux fois non plus, comme sur le
     * web ({@link NotificationCorrectionRules}).
     */
    private boolean withheld(Map<String, String> data) {
        String tag = NotificationFunnelRules.bannerTag(data);
        if (tag.isEmpty() || !NotificationFunnelRules.fcmDisplays(data)) return false;
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return false;
            Notification found = NotificationVoiceBanner.find(manager, tag);
            NotificationCorrectionRules.Shown shown = found == null ? null : shownOf(found.extras);
            if (NotificationCorrectionRules.isCorrection(data)) return !NotificationCorrectionRules.shows(data, shown);
            return NotificationCorrectionRules.repeats(data, shown);
        } catch (RuntimeException failure) {
            Log.w(TAG, "push affiche sans verification", failure);
            return false;
        }
    }

    /** #11054 — ce que le systeme laisse FCM afficher ; dans le doute, il affiche. */
    private boolean systemShows(Map<String, String> data) {
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return true;
            Integer importance = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = manager.getNotificationChannel(NotificationFunnelRules.channelOf(data));
                if (channel == null) channel = manager.getNotificationChannel(NotificationFunnelRules.DEFAULT_CHANNEL);
                if (channel != null) importance = channel.getImportance();
            }
            return NotificationFunnelRules.systemShows(manager.areNotificationsEnabled(), importance);
        } catch (RuntimeException failure) {
            Log.w(TAG, "affichage suppose", failure);
            return true;
        }
    }

    private static NotificationCorrectionRules.Shown shownOf(Bundle extras) {
        if (extras == null) return new NotificationCorrectionRules.Shown(null, null, null);
        return new NotificationCorrectionRules.Shown(
            extras.getString(NotificationCorrectionRules.EXTRA_NOTIFICATION_ID),
            textOf(extras.getCharSequence(Notification.EXTRA_TITLE)),
            textOf(extras.getCharSequence(Notification.EXTRA_TEXT)));
    }

    private static String textOf(CharSequence value) {
        return value == null ? null : value.toString();
    }

    /** #11032 — la banniere marquee d'une notification revoquee, sous quelque tag que ce soit. */
    private static void cancelMarked(NotificationManager manager, Map<String, String> data) {
        try {
            for (StatusBarNotification active : manager.getActiveNotifications()) {
                Bundle extras = active.getNotification().extras;
                String marked = extras == null ? null : extras.getString(NotificationCorrectionRules.EXTRA_NOTIFICATION_ID);
                if (NotificationRevocation.closesMarked(data, marked)) manager.cancel(active.getTag(), active.getId());
            }
        } catch (RuntimeException failure) {
            Log.w(TAG, "bannieres marquees non revoquees", failure);
        }
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);
        List<String> revoked = NotificationRevocation.tagsToCancel(message.getData());
        if (!revoked.isEmpty()) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                for (String tag : revoked) manager.cancel(tag, 0);
                cancelMarked(manager, message.getData());
            }
            return;
        }
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
                acknowledgeDelivery(PushDeliveryReceipt.of(message.getData(), CallShellStore.apiBase(this)));
        }
    }

    /**
     * Best-effort, comme `sw-push.js` : un accuse manque (pas de credential,
     * reseau coupe) laisse le message « envoye » jusqu'a la reconnexion — l'etat
     * d'avant #8124, jamais pire. `onMessageReceived` et `handleIntent` tournent
     * deja hors du fil principal : l'appel reseau y est permis.
     */
    private void acknowledgeDelivery(PushDeliveryReceipt receipt) {
        if (receipt == null) return;
        String[] header = CallShellStore.credentialHeader(this);
        if (header == null) return;
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
