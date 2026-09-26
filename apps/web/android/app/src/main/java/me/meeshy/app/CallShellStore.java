package me.meeshy.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Ce que la coque retient de l'appel ENTRE deux processus (#8049) : le registre
 * des appels qui ne sonnent plus ({@link CallRingLedger}) et le credential du
 * refus sans socket.
 *
 * **Le credential vit en SharedPreferences PRIVEES, pas en
 * EncryptedSharedPreferences — choix assume.** `DeclineCallReceiver` refuse un
 * appel app tuee, donc sans page ni socket : il lui faut `apiBase` et le
 * jeton, que la page pose au login par `MeeshyCallPlugin.setCredential` et
 * retire a la deconnexion (`src/lib/calls/shell-call.ts`, meme discipline que
 * `delivery-receipt-credential.ts` pour le service worker web). Le MEME jeton
 * vit deja en clair dans le `localStorage` de la WebView, sous le meme bac a
 * sable applicatif : le chiffrer ICI n'ajouterait aucune protection a celle
 * que l'appareil offre deja, et `androidx.security:security-crypto` est
 * deprecie par Google. Le fichier n'est lisible que par l'application
 * (MODE_PRIVATE) et il est EXCLU de la sauvegarde et du transfert d'appareil
 * (`res/xml/backup_rules.xml`, `res/xml/data_extraction_rules.xml`) : un
 * jeton restaure sur un autre appareil n'y a rien a faire.
 */
final class CallShellStore {

    private static final String PREFS = "meeshy_call_shell";
    private static final String KEY_LEDGER = "ledger";
    private static final String KEY_API_BASE = "apiBase";
    private static final String KEY_KIND = "credentialKind";
    private static final String KEY_TOKEN = "credentialToken";

    private CallShellStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized CallRingLedger ledger(Context context) {
        return CallRingLedger.decode(prefs(context).getString(KEY_LEDGER, ""));
    }

    static synchronized void silence(Context context, String callId) {
        if (callId == null || callId.isEmpty()) return;
        CallRingLedger next = ledger(context).with(callId, System.currentTimeMillis());
        prefs(context).edit().putString(KEY_LEDGER, next.encode()).apply();
    }

    static void saveCredential(Context context, String apiBase, String kind, String token) {
        prefs(context).edit().putString(KEY_API_BASE, apiBase).putString(KEY_KIND, kind).putString(KEY_TOKEN, token).apply();
    }

    static void clearCredential(Context context) {
        prefs(context).edit().remove(KEY_API_BASE).remove(KEY_KIND).remove(KEY_TOKEN).apply();
    }

    static String apiBase(Context context) {
        return prefs(context).getString(KEY_API_BASE, null);
    }

    static String[] credentialHeader(Context context) {
        SharedPreferences prefs = prefs(context);
        return CallShellRules.credentialHeader(prefs.getString(KEY_KIND, null), prefs.getString(KEY_TOKEN, null));
    }
}
