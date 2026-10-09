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
     * #9845 — la forme de la fenetre flottante, celle de la video comme dans
     * Chrome Android, ramenee dans les bornes qu'Android accepte (entre 1:2,39
     * et 2,39:1, sinon `enterPictureInPictureMode` leve), un cran a
     * l'interieur pour qu'un arrondi flottant ne la fasse pas refuser. `null`
     * quand la page ne connait pas encore la taille : le systeme garde la sienne.
     */
    static final int BOUND_LONG = 238;
    static final int BOUND_SHORT = 100;

    public static int[] aspect(int width, int height) {
        if (width <= 0 || height <= 0) return null;
        if ((long) width * BOUND_SHORT > (long) height * BOUND_LONG) return new int[] { BOUND_LONG, BOUND_SHORT };
        if ((long) height * BOUND_SHORT > (long) width * BOUND_LONG) return new int[] { BOUND_SHORT, BOUND_LONG };
        return new int[] { width, height };
    }
}

