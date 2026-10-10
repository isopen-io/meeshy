package me.meeshy.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.browser.customtabs.CustomTabsIntent;
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
 *
 * En sens inverse, un lien EXTERNE touche dans la page (#9858) : Capacitor
 * lancerait un `ACTION_VIEW` nu, qui ouvre l'application du navigateur et fait
 * quitter Meeshy. Le pont essaie d'abord l'app native qui gere le lien
 * (Android 11+), puis un Custom Tab pose au-dessus de l'app, comme
 * `SFSafariViewController` sur iPhone.
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

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        Uri app = Uri.parse(getBridge().getAppUrl());
        if (!ExternalLinkRules.opensOutside(url.getScheme(), url.getHost(), app.getHost())) {
            return null;
        }
        if (openInNativeApp(url) || openInCustomTab(url)) {
            return true;
        }
        return null;
    }

    private boolean openInNativeApp(Uri url) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return false;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, url)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER);
        try {
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    private boolean openInCustomTab(Uri url) {
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(getActivity(), url);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }
}
