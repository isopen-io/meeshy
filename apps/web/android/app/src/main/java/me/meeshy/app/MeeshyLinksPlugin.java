package me.meeshy.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * L'entree systeme d'un lien profond (#5819). Les filtres de
 * `AndroidManifest.xml` font arriver les App Links de `meeshy.me` et le
 * schema court `meeshy://` sur `MainActivity` ; Capacitor ne les route pas :
 * la WebView demarre toujours sur `/`. Ce pont relaie chaque intent VIEW au
 * routeur web (`src/lib/links/shell-deep-links.ts`) par `appUrlOpen`.
 *
 * `BridgeActivity.load()` rejoue l'intent de LANCEMENT par `onNewIntent`
 * avant que la page n'ait charge : l'evenement est donc RETENU jusqu'a ce que
 * le web s'abonne, et le lien d'un lancement a froid n'est pas perdu. Un lien
 * recu app ouverte (`singleTask`) arrive par le meme chemin.
 */
@CapacitorPlugin(name = "MeeshyLinks")
public class MeeshyLinksPlugin extends Plugin {

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return;
        }
        Uri data = intent.getData();
        if (data == null) {
            return;
        }
        JSObject event = new JSObject();
        event.put("url", data.toString());
        notifyListeners("appUrlOpen", event, true);
    }
}
