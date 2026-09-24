package me.meeshy.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le pont de partage de la coque (#7710). La WebView Android n'implemente pas
 * l'API Web Share : `navigator.share` y est absent (crbug 765923), et
 * `portailDuNavigateur()` (`src/lib/view/invitation.ts`) ne voyait qu'un
 * presse-papier — chaque « Partager » copiait le lien la ou le web mobile et
 * iOS ouvrent la feuille du systeme.
 *
 * Le cote web appelle `Capacitor.nativePromise('MeeshyShare', 'share', ...)`
 * quand `navigator.share` manque. L'appel se resout des que la feuille est
 * ouverte : le choix de l'application ne revient pas a la WebView, et
 * l'annulation n'y est pas distinguee (elle compte comme un partage, comme une
 * copie compte deja). Un refus (rien a partager, aucune application capable)
 * rejette, et le web retombe sur la copie du lien.
 */
@CapacitorPlugin(name = "MeeshyShare")
public class MeeshySharePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "");
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String body = text.isEmpty() ? url : url.isEmpty() ? text : text + "\n" + url;
        if (body.isEmpty()) {
            call.reject("Rien a partager");
            return;
        }

        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, body);
        if (!title.isEmpty()) {
            send.putExtra(Intent.EXTRA_SUBJECT, title);
        }

        try {
            getActivity().startActivity(Intent.createChooser(send, title.isEmpty() ? null : title));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Aucune application ne sait partager ce lien", e);
        }
    }
}
