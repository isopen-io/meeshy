package me.meeshy.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

/**
 * Le chemin de retour d'une permission de notification refusee (#7307).
 * Android ne redemande plus apres un refus : seul l'ecran systeme des
 * notifications de l'app peut la rendre. Les reglages de la coque
 * (`src/lib/push/device-permission.ts`) l'ouvrent par ce pont.
 *
 * #8477 — il dit aussi si FCM est configure. Sans `google-services.json`,
 * aucune `FirebaseApp` n'existe et `PushNotificationsPlugin.register` leve sur
 * le fil des plugins : le processus meurt. La garde JS (`fcm-guard.ts`) lit
 * `fcmStatus` avant tout `register()`.
 */
@CapacitorPlugin(name = "MeeshyNotificationSettings")
public class MeeshyNotificationSettingsPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String packageName = getContext().getPackageName();
        Intent intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("settings-unavailable", error);
        }
    }

    @PluginMethod
    public void fcmStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("configured", !FirebaseApp.getApps(getContext()).isEmpty());
        call.resolve(result);
    }
}
