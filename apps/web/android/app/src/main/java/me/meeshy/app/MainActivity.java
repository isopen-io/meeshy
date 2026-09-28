package me.meeshy.app;

import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.WebViewListener;

/**
 * Defaut de coque 3b (#5604, recette 2026-09-07) : `BridgeActivity` (Capacitor
 * 8) ne surcharge PLUS `onBackPressed()` par defaut — un seul appui materiel
 * FERME l'application, quel que soit l'historique JS du routeur maison
 * (`src/lib/router.tsx` pousse pourtant de VRAIES entrees via `pushState`).
 * Verifie : `canGoBack()` de la WebView est VRAI depuis le fil vers la liste,
 * et pourtant l'appui rendait directement au lanceur.
 *
 * Le correctif vit ICI, cote coque, avant toute piste applicative (§ R2 de la
 * specification) : la WebView suit son historique de navigation quand elle en
 * a un, et le comportement systeme par defaut (retour au lanceur) ne joue que
 * lorsqu'elle n'en a plus — exactement le motif que Capacitor recommandait
 * lui-meme avant de le retirer du coeur en version 3.
 */
public class MainActivity extends BridgeActivity {

    /**
     * #8049 — l'application est-elle a l'ecran ? Alors le socket fait deja
     * sonner l'ecran d'appel, et une poussee d'appel ne pose PAS de seconde
     * sonnerie (`CallPush`, jumeau de `visibilityState === 'visible'` dans
     * `public/sw-push.js`). Processus tue : faux, la notification sonne.
     */
    private static volatile boolean inForeground;

    /** #8564 — horloge monotone de la derniere reprise, gardee par le processus. */
    private static volatile long lastRendererRecovery = RendererRecovery.NEVER;

    static boolean isInForeground() {
        return inForeground;
    }

    @Override
    public void onResume() {
        super.onResume();
        inForeground = true;
    }

    @Override
    public void onPause() {
        inForeground = false;
        super.onPause();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Un plugin local s'enregistre AVANT `super.onCreate` : c'est la que
        // `BridgeActivity` construit le pont et publie `PluginHeaders` (#7710,
        // #5819).
        registerPlugin(MeeshySharePlugin.class);
        registerPlugin(MeeshyLinksPlugin.class);
        registerPlugin(MeeshyCallPlugin.class);
        registerPlugin(MeeshyContactsPlugin.class);
        registerPlugin(MeeshyNotificationSettingsPlugin.class);
        super.onCreate(savedInstanceState);
        // #8547 — sans `poster`, le web montre le fond du `<video>` jusqu'a sa
        // premiere image ; la WebView dessine son icone « lecture » grise si
        // son client ne fournit pas d'apercu. On garde le client de Capacitor
        // (permissions, fichiers, plein ecran) et on ne change que l'apercu.
        getBridge()
            .getWebView()
            .setWebChromeClient(
                new BridgeWebChromeClient(getBridge()) {
                    @Override
                    public Bitmap getDefaultVideoPoster() {
                        return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                    }
                }
            );
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                        long now = SystemClock.elapsedRealtime();
                        if (!RendererRecovery.shouldRecover(lastRendererRecovery, now)) {
                            return false;
                        }
                        lastRendererRecovery = now;
                        recreate();
                        return true;
                    }
                }
            );
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView webView = getBridge().getWebView();
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }
                        // #7988 — depuis Android 12, ce retour ne detruit plus
                        // l'activite : rouverte, elle doit retrouver ce callback,
                        // sinon le retour fermerait l'app depuis n'importe quel ecran.
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                }
            );
    }
}
