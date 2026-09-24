package me.meeshy.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le pont de partage de la coque (#7710). La WebView Android n'implemente pas
 * l'API Web Share : `navigator.share` y est absent (crbug 765923), et
 * `portailDuNavigateur()` (`src/lib/view/invitation.ts`) ne voyait qu'un
 * presse-papier — chaque « Partager » copiait le lien la ou le web mobile et
 * iOS ouvrent la feuille du systeme.
 *
 * Le cote web appelle `Capacitor.nativePromise('MeeshyShare', 'share', ...)`
 * quand `navigator.share` manque. La feuille est lancee POUR RESULTAT (#7822) :
 * fermee sans choix, elle revient annulee alors que l'activite n'a jamais ete
 * stoppee, et le pont rejette avec le code `CANCELED` — le web le traduit en
 * `AbortError`, comme une annulation de `navigator.share` : ni copie, ni
 * partage compte. Certaines applications rendent aussi « annule » apres un
 * vrai partage ; elles ont stoppe l'activite en s'ouvrant, d'ou le drapeau
 * (heuristique de `@capacitor/share`). Un refus (rien a partager, aucune
 * application capable) rejette sans code, et le web retombe sur la copie.
 */
@CapacitorPlugin(name = "MeeshyShare")
public class MeeshySharePlugin extends Plugin {

    private boolean stopped = false;

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
            stopped = false;
            startActivityForResult(call, Intent.createChooser(send, title.isEmpty() ? null : title), "shareResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Aucune application ne sait partager ce lien", e);
        }
    }

    @ActivityCallback
    private void shareResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED && !stopped) {
            call.reject("Partage annule", "CANCELED");
            return;
        }
        call.resolve();
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        stopped = true;
    }
}
