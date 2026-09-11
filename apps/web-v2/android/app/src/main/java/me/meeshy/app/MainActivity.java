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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
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
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                    }
                }
            );
    }
}
