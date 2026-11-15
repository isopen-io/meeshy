package me.meeshy.app;

/**
 * #9242 — une video en plein ecran flotte en image dans l'image quand on
 * quitte l'app, comme dans Chrome Android. La vue plein ecran de la WebView
 * (#8594) ne porte que la video : la fenetre flottante ne montre qu'elle.
 * Testee sur la JVM seule.
 */
public final class FullscreenPictureInPicture {

    /** `Build.VERSION_CODES.O` : la premiere API qui sait flotter. */
    static final int MIN_SDK = 26;

    private FullscreenPictureInPicture() {}

    public static boolean floats(int sdk, boolean fullscreenShown, boolean systemSupports) {
        return sdk >= MIN_SDK && fullscreenShown && systemSupports;
    }

    /**
     * #9847 — le bouton de la fenetre flottante d'une video, comme dans
     * Chrome Android : « pause » quand elle joue, « play » quand elle est en
     * pause. Aucun bouton tant que la page n'a pas dit l'etat de la video.
     */
    public static String toggleAction(Boolean playing) {
        if (playing == null) return null;
        return playing ? "pause" : "play";
    }
}
