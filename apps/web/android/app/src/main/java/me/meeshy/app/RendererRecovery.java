package me.meeshy.app;

/**
 * #8564 — la perte du moteur de rendu de la WebView ne ferme plus Meeshy :
 * la coque recree l'activite, comme un navigateur recharge l'onglet. Une
 * seconde perte dans la fenetre laisse Android decider (fermeture), pour ne
 * pas boucler sur une page qui plante a coup sur.
 */
public final class RendererRecovery {

    public static final long NEVER = Long.MIN_VALUE;
    public static final long WINDOW_MS = 30 * 1000L;

    private RendererRecovery() {}

    public static boolean shouldRecover(long lastRecoveryAt, long now) {
        return lastRecoveryAt == NEVER || now - lastRecoveryAt > WINDOW_MS;
    }
}
