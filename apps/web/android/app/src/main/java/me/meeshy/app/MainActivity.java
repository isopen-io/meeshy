package me.meeshy.app;

import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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

    /**
     * #8594 — la vue plein ecran que la WebView confie a son client. Capacitor
     * la refermait aussitot accordee (`BridgeWebChromeClient.onShowCustomView`) :
     * `requestFullscreen()` et le bouton plein ecran d'un `<video>` ne faisaient
     * rien, la ou le web agrandit l'element.
     */
    private WebChromeClient chromeClient;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

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
        suivreTailleDuTexte(getResources().getConfiguration());
        // #8547 — sans `poster`, le web montre le fond du `<video>` jusqu'a sa
        // premiere image ; la WebView dessine son icone « lecture » grise si
        // son client ne fournit pas d'apercu. On garde le client de Capacitor
        // (permissions, fichiers) et on remplace l'apercu et le plein ecran.
        chromeClient = new BridgeWebChromeClient(getBridge()) {
            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = view;
                fullscreenCallback = callback;
                ((ViewGroup) getWindow().getDecorView()).addView(
                        view,
                        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    );
                WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                bars.hide(WindowInsetsCompat.Type.systemBars());
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) {
                    return;
                }
                ((ViewGroup) getWindow().getDecorView()).removeView(fullscreenView);
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).show(WindowInsetsCompat.Type.systemBars());
                WebChromeClient.CustomViewCallback callback = fullscreenCallback;
                fullscreenView = null;
                fullscreenCallback = null;
                callback.onCustomViewHidden();
            }
        };
        getBridge().getWebView().setWebChromeClient(chromeClient);
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
                        if (fullscreenView != null) {
                            chromeClient.onHideCustomView();
                            return;
                        }
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

    /**
     * #8616 — la taille, la graisse et le sens du texte sont declares dans
     * `configChanges` : sans cela, les regler dans Android recreait l'activite,
     * et Capacitor detruisait la WebView puis rechargeait l'URL de depart
     * (brouillon, fil ouvert et appel perdus). Chrome suit la taille de police
     * du systeme sans recharger ; la coque regle donc elle-meme le zoom de
     * texte de la WebView, au demarrage et a chaque changement.
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        suivreTailleDuTexte(newConfig);
    }

    private void suivreTailleDuTexte(Configuration config) {
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setTextZoom(Math.round(config.fontScale * 100));
        }
    }
}
