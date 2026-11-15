package me.meeshy.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

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
 * (Android 11+, ou par comparaison aux navigateurs avant, #10456), puis un
 * Custom Tab pose au-dessus de l'app, comme
 * `SFSafariViewController` sur iPhone.
 *
 * Le navigateur de ce Custom Tab est prechauffe des le chargement de la coque
 * (#10888) : sans cette liaison, chaque premier lien externe demarrait le
 * navigateur a froid, la ou le web ouvre un onglet d'un navigateur deja lance.
 */
@CapacitorPlugin(name = "MeeshyLinks")
public class MeeshyLinksPlugin extends Plugin {

    private CustomTabsServiceConnection customTabs;

    @Override
    public void load() {
        String browser = CustomTabsClient.getPackageName(getContext(), null);
        if (browser == null) {
            return;
        }
        CustomTabsServiceConnection connection = new CustomTabsServiceConnection() {
            @Override
            public void onCustomTabsServiceConnected(ComponentName name, CustomTabsClient client) {
                client.warmup(0L);
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {}
        };
        try {
            if (CustomTabsClient.bindCustomTabsService(getContext(), browser, connection)) {
                customTabs = connection;
            }
        } catch (SecurityException e) {
            customTabs = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (customTabs == null) {
            return;
        }
        try {
            getContext().unbindService(customTabs);
        } catch (IllegalArgumentException e) {
            // Deja deliee par le systeme.
        }
        customTabs = null;
    }

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
        Intent intent = new Intent(Intent.ACTION_VIEW, url)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            intent.addFlags(Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER);
        } else {
            if (!hasSpecializedHandler(url)) {
                return false;
            }
        }
        try {
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    /**
     * #10456 — avant Android 11, existe-t-il une application qui gere le lien
     * sans etre un navigateur : les applications qui gerent ce lien, moins
     * celles qui gerent un lien web quelconque. La visibilite des paquets n'existe pas avant
     * Android 11 : aucune declaration `<queries>` n'est requise.
     */
    private boolean hasSpecializedHandler(Uri url) {
        PackageManager packages = getContext().getPackageManager();
        Intent anyWebLink = new Intent(Intent.ACTION_VIEW, Uri.parse("http://www.example.com"))
            .addCategory(Intent.CATEGORY_BROWSABLE);
        Intent link = new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE);
        return ExternalLinkRules.hasSpecializedHandler(
            packageNames(packages.queryIntentActivities(link, 0)),
            packageNames(packages.queryIntentActivities(anyWebLink, PackageManager.MATCH_ALL))
        );
    }

    private static List<String> packageNames(List<ResolveInfo> activities) {
        List<String> names = new ArrayList<>();
        for (ResolveInfo activity : activities) {
            if (activity.activityInfo != null) names.add(activity.activityInfo.packageName);
        }
        return names;
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
