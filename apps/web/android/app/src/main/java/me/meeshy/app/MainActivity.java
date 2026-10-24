package me.meeshy.app;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.location.LocationManager;
import android.net.Uri;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Rational;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.location.LocationManagerCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;
import java.util.ArrayList;

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
    private OnBackPressedCallback backCallback;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    /** #9410 — le plein ecran demande pour flotter : il flotte des qu'il est montre. */
    private boolean floatOnFullscreen;

    /** #9845 — la forme de la video que la page a fait flotter, tant que son plein ecran dure. */
    private Rational floatAspect;

    /** #9847 — la video qui flotte joue-t-elle ? null tant que la page ne l'a pas dit. */
    private Boolean floatPlaying;

    /** #10087 — le selecteur de photos du systeme, et l'entree qui attend sa reponse. */
    private ActivityResultLauncher<Intent> photoPicker;
    private ValueCallback<Uri[]> pickCallback;

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

    /**
     * #8144 — Accueil ou autre app pendant un appel video : l'activite flotte
     * en image dans l'image, la ou le web ouvre Document PiP. Le service au
     * premier plan gardait deja l'appel vivant ; l'image disparaissait. L'API
     * 26 est verifiee par `CallShellRules.entersPictureInPicture`.
     *
     * #9242 — hors appel, une video en plein ecran flotte de meme, comme dans
     * Chrome Android ; l'API 26 est verifiee par `FullscreenPictureInPicture`.
     */
    @Override
    @SuppressLint("NewApi")
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        MeeshyCallPlugin call = callPlugin();
        try {
            if (call != null && call.floatsInPictureInPicture()) {
                enterPictureInPictureMode(call.pictureInPictureParams());
                return;
            }
            boolean supported = getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
            if (FullscreenPictureInPicture.floats(Build.VERSION.SDK_INT, fullscreenView != null, supported)) {
                enterPictureInPictureMode(floatParams());
            }
        } catch (IllegalStateException refused) {
            // PiP coupee pour Meeshy dans les reglages : l'appel ou la video continue en arriere-plan.
        }
    }

    /**
     * #9410 — le bouton « image dans l'image » d'une video, que la WebView
     * n'offre pas : la page a passe la video en plein ecran, l'activite flotte
     * maintenant, ou des que la vue plein ecran lui est confiee.
     */
    boolean floatVideo(int width, int height) {
        boolean supported = getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        if (!FullscreenPictureInPicture.floats(Build.VERSION.SDK_INT, true, supported)) return false;
        int[] aspect = CallShellRules.pictureInPictureAspect(width, height);
        floatAspect = aspect == null ? null : new Rational(aspect[0], aspect[1]);
        if (fullscreenView != null) return enterFloat();
        floatOnFullscreen = true;
        return true;
    }

    @SuppressLint("NewApi")
    private PictureInPictureParams floatParams() {
        PictureInPictureParams.Builder params = new PictureInPictureParams.Builder();
        if (floatAspect != null) params.setAspectRatio(floatAspect);
        ArrayList<RemoteAction> actions = new ArrayList<>();
        String toggle = FullscreenPictureInPicture.toggleAction(floatPlaying);
        if (toggle != null) actions.add(toggleAction("pause".equals(toggle)));
        params.setActions(actions);
        return params.build();
    }

    @SuppressLint("NewApi")
    private RemoteAction toggleAction(boolean pause) {
        PendingIntent pending = PendingIntent.getBroadcast(
            this,
            MeeshyPlaybackPlugin.ACTION_FLOAT_TOGGLE.hashCode(),
            new Intent(MeeshyPlaybackPlugin.ACTION_FLOAT_TOGGLE).setPackage(getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String label = getString(pause ? R.string.playback_pause : R.string.playback_play);
        Icon icon = Icon.createWithResource(this, pause ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        return new RemoteAction(icon, label, label, pending);
    }

    /**
     * #9847 — la page dit si la video qui flotte joue : le bouton de la
     * fenetre suit, qu'elle flotte deja ou pas encore.
     */
    @SuppressLint("NewApi")
    void floatPlaying(boolean playing) {
        floatPlaying = playing;
        if (fullscreenView == null || Build.VERSION.SDK_INT < FullscreenPictureInPicture.MIN_SDK) return;
        try {
            setPictureInPictureParams(floatParams());
        } catch (IllegalStateException | IllegalArgumentException refused) {
            // PiP coupee pour Meeshy : la video garde ses commandes dans la page.
        }
    }

    @SuppressLint("NewApi")
    private boolean enterFloat() {
        try {
            return enterPictureInPictureMode(floatParams());
        } catch (IllegalStateException refused) {
            return false;
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean active, Configuration newConfig) {
        super.onPictureInPictureModeChanged(active, newConfig);
        MeeshyCallPlugin call = callPlugin();
        if (call != null) call.pictureInPictureChanged(active);
    }

    /** #10227 — les reglages de localisation du systeme, comme Chrome a defaut de Play Services. */
    private void openLocationSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
        } catch (android.content.ActivityNotFoundException missing) {
            // Aucun ecran de reglages : la page garde son « Reessayer ».
        }
    }

    private boolean locationEnabled() {
        LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        return manager == null || LocationManagerCompat.isLocationEnabled(manager);
    }

    /** #10087 — l'entree recoit toujours une reponse, vide quand rien n'est choisi. */
    private void photosPicked(ActivityResult result) {
        ValueCallback<Uri[]> callback = pickCallback;
        pickCallback = null;
        if (callback == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != RESULT_OK || data == null) {
            callback.onReceiveValue(null);
            return;
        }
        if (data.getClipData() != null) {
            Uri[] picked = new Uri[data.getClipData().getItemCount()];
            for (int i = 0; i < picked.length; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
            callback.onReceiveValue(picked);
            return;
        }
        callback.onReceiveValue(data.getData() == null ? null : new Uri[] { data.getData() });
    }

    private MeeshyCallPlugin callPlugin() {
        PluginHandle handle = getBridge() == null ? null : getBridge().getPlugin("MeeshyCall");
        return handle == null ? null : (MeeshyCallPlugin) handle.getInstance();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Un plugin local s'enregistre AVANT `super.onCreate` : c'est la que
        // `BridgeActivity` construit le pont et publie `PluginHeaders` (#7710,
        // #5819).
        registerPlugin(MeeshySharePlugin.class);
        registerPlugin(MeeshyLinksPlugin.class);
        registerPlugin(MeeshyShareIntentPlugin.class);
        registerPlugin(MeeshyCallPlugin.class);
        registerPlugin(MeeshyContactsPlugin.class);
        registerPlugin(MeeshyNotificationSettingsPlugin.class);
        registerPlugin(MeeshyClipboardPlugin.class);
        registerPlugin(MeeshyRecorderPlugin.class);
        registerPlugin(MeeshyPlaybackPlugin.class);
        registerPlugin(MeeshySpeechPlugin.class);
        registerPlugin(ScreenBrightnessPlugin.class);
        registerPlugin(MeeshyFileSinkPlugin.class);
        registerPlugin(MeeshyScreenGuardPlugin.class);
        registerPlugin(MeeshyLocalePlugin.class);
        registerPlugin(MeeshySystemBarsPlugin.class);
        registerPlugin(MeeshyWidgetsPlugin.class);
        // #10034 — recreee par Android, l'activite rejoue l'ecran ouvert par le
        // chemin des liens profonds : `BridgeActivity.load()` relit l'intent.
        String route = savedInstanceState == null ? null : savedInstanceState.getString(ShellRoute.KEY);
        if (route != null) setIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(route)));
        super.onCreate(savedInstanceState);
        // #12447 — bord a bord a toute version, comme Android 15 l'impose :
        // une seule geometrie d'ecran, et plus d'API de barres obsoletes.
        // APRES `super.onCreate` : `enable` installe la fenetre, et avant le
        // `setTheme(AppTheme_NoActionBar)` de `BridgeActivity` elle garderait
        // la barre d'action du theme de l'application.
        EdgeToEdge.enable(this);
        // #10375 — les touches de volume reglent les medias, comme dans Chrome,
        // et non la sonnerie ; un appel les rend a la voix (`MeeshyCallPlugin`).
        setVolumeControlStream(VolumeStreamRules.stream(false));
        suivreTailleDuTexte(getResources().getConfiguration());
        SilentNotificationChannel.ensure(ShellLocale.wrap(this));
        photoPicker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::photosPicked);
        // #8547 — sans `poster`, le web montre le fond du `<video>` jusqu'a sa
        // premiere image ; la WebView dessine son icone « lecture » grise si
        // son client ne fournit pas d'apercu. On garde le client de Capacitor
        // (permissions, fichiers) et on remplace l'apercu et le plein ecran.
        chromeClient = new BridgeWebChromeClient(getBridge()) {
            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }

            /**
             * #10087 — une entree qui n'accepte que des photos et/ou des
             * videos ouvre le selecteur de photos du systeme, comme Chrome ;
             * tout le reste garde le chemin de Capacitor.
             */
            @Override
            @SuppressLint("NewApi")
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                String type = PhotoPickRules.pickerType(Build.VERSION.SDK_INT, params.getAcceptTypes(), params.isCaptureEnabled(),
                    MimeTypeMap.getSingleton()::getMimeTypeFromExtension);
                if (type == null) return super.onShowFileChooser(webView, callback, params);
                Intent pick = new Intent(MediaStore.ACTION_PICK_IMAGES);
                if (!PhotoPickRules.BOTH.equals(type)) pick.setType(type);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    pick.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, MediaStore.getPickImagesMaxLimit());
                }
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = callback;
                try {
                    photoPicker.launch(pick);
                } catch (android.content.ActivityNotFoundException missing) {
                    pickCallback = null;
                    return super.onShowFileChooser(webView, callback, params);
                }
                return true;
            }

            /**
             * #10227 — Capacitor demande la permission, puis la page recoit
             * sa reponse ; localisation eteinte, la coque ouvre ses reglages
             * comme Chrome, et « Reessayer » aboutit au retour.
             */
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                super.onGeolocationPermissionsShowPrompt(origin, (requestOrigin, allow, retain) -> {
                    callback.invoke(requestOrigin, allow, retain);
                    if (LocationPromptRules.opensLocationSettings(allow, locationEnabled())) openLocationSettings();
                });
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
                if (floatOnFullscreen) {
                    floatOnFullscreen = false;
                    enterFloat();
                }
                syncBack();
            }

            @Override
            public void onHideCustomView() {
                floatOnFullscreen = false;
                floatAspect = null;
                floatPlaying = null;
                if (fullscreenView == null) {
                    return;
                }
                ((ViewGroup) getWindow().getDecorView()).removeView(fullscreenView);
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).show(WindowInsetsCompat.Type.systemBars());
                WebChromeClient.CustomViewCallback callback = fullscreenCallback;
                fullscreenView = null;
                fullscreenCallback = null;
                callback.onCustomViewHidden();
                syncBack();
            }
        };
        getBridge().getWebView().setWebChromeClient(chromeClient);
        // #10250 — la WebView dessine son effet de bord sans lire
        // `overscroll-behavior` ; Chrome, lui, le coupe comme la page le demande.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                        long now = SystemClock.elapsedRealtime();
                        if (!RendererRecovery.shouldRecover(lastRendererRecovery, now, detail.didCrash())) {
                            return false;
                        }
                        lastRendererRecovery = now;
                        recreate();
                        return true;
                    }
                }
            );
        // #10585 — chaque entree d'historique (pushState et fermeture de
        // panneau compris) dit si le retour reste a la WebView ou revient au
        // systeme, qui anime alors le retour a l'accueil sur Android 16.
        getBridge()
            .setWebViewClient(
                new BridgeWebViewClient(getBridge()) {
                    @Override
                    public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                        super.doUpdateVisitedHistory(view, url, isReload);
                        syncBack();
                    }
                }
            );
        backCallback = new OnBackPressedCallback(false) {
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
                // #7988, #10585 — l'historique a change entre la derniere
                // synchronisation et le geste : le retour revient au systeme,
                // et la prochaine entree d'historique reactivera ce callback.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCallback);
        syncBack();
    }

    private void syncBack() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (backCallback == null) return;
        backCallback.setEnabled(BackRules.interceptsBack(fullscreenView != null, webView != null && webView.canGoBack()));
    }

    /** #10034 — l'adresse in-app de la WebView, gardee pour une recreation. */
    @Override
    public void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        String route = ShellRoute.restoreLink(webView.getUrl(), getBridge().getAppUrl());
        if (route != null) outState.putString(ShellRoute.KEY, route);
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
