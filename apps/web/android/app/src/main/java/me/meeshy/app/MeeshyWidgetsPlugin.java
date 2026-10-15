package me.meeshy.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * #10626 — le pont page → widgets d'ecran d'accueil, sans second SDK : la
 * page (deja connectee, deja en cache) publie un instantane JSON
 * (`src/lib/shell-widgets/`), range ici dans un `SharedPreferences` dedie ;
 * les widgets ne lisent que lui. `clear` a la deconnexion efface aussi les
 * visages du compte quitte ; `drainMarkRead` remet a la page les « marquer
 * lu » touches sur un widget. Un lien `?compose=1` (« Repondre ») signale
 * en plus la conversation dont la page doit focaliser le composeur — retenu
 * jusqu'a l'abonnement, pour un lancement a froid.
 */
@CapacitorPlugin(name = "MeeshyWidgets")
public class MeeshyWidgetsPlugin extends Plugin {

    @PluginMethod
    public void publish(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            call.reject("json manquant");
            return;
        }
        Context context = getContext().getApplicationContext();
        WidgetStore.publish(context, json);
        WidgetRefresher.refreshAll(context);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context context = getContext().getApplicationContext();
        WidgetStore.clear(context);
        WidgetRefresher.WORK.execute(() -> WidgetAvatars.clear(context));
        WidgetRefresher.refreshAll(context);
        call.resolve();
    }

    @PluginMethod
    public void drainMarkRead(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ids", new JSArray(WidgetStore.drainMarkRead(getContext().getApplicationContext())));
        call.resolve(result);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri data = intent.getData();
        String conversationId = data == null ? null : WidgetActionRules.composeTarget(data.toString());
        if (conversationId == null) return;
        JSObject event = new JSObject();
        event.put("conversationId", conversationId);
        notifyListeners("composeRequested", event, true);
    }
}
