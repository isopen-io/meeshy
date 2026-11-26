package me.meeshy.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * #19243 — le SCEAU des intents que la coque se remet a elle-meme.
 *
 * `MainActivity` est exportee (liens meeshy.me et `meeshy://`) : toute app peut
 * lui remettre un intent portant l'extra « Repondre » d'un appel ou un lien
 * `?rappeler=`. Seuls les intents scelles par la coque decrochent ou composent :
 * le sceau, tire une fois par installation, vit dans les SharedPreferences
 * privees ({@link CallShellStore}) et ne voyage que dans les `PendingIntent`
 * de l'app et ses relais non exportes, dont aucune autre app ne lit les extras.
 */
final class IntentSealRules {

    static final String EXTRA_SEAL = "me.meeshy.app.intent.seal";

    private static final int BYTES = 32;
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private IntentSealRules() {}

    static String fresh(SecureRandom random) {
        byte[] bytes = new byte[BYTES];
        random.nextBytes(bytes);
        char[] out = new char[BYTES * 2];
        for (int i = 0; i < BYTES; i++) {
            out[i * 2] = HEX[(bytes[i] >> 4) & 0xF];
            out[i * 2 + 1] = HEX[bytes[i] & 0xF];
        }
        return new String(out);
    }

    /** Le sceau presente est-il exactement celui de la coque ? Comparaison a temps constant. */
    static boolean honours(String expected, String presented) {
        if (expected == null || expected.isEmpty() || presented == null || presented.isEmpty()) return false;
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8));
    }
}
