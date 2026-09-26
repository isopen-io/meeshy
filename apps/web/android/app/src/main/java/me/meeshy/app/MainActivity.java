package me.meeshy.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

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
        super.onCreate(savedInstanceState);
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
