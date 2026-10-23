package me.meeshy.app;

import java.util.Map;

/**
 * UNE CORRECTION REMPLACE UNE BANNIERE, ELLE N'EN LEVE JAMAIS UNE (#10989) —
 * jumeau de `sw-push.js` § corriger (#7342).
 *
 * Editer un message repousse sa notification sous la MEME identite
 * (`reproduced`), et sur Android sous le tag de la conversation. FCM
 * l'affichait sans condition app fermee : la banniere balayee revenait en
 * sonnant, et celle d'un message plus recent du fil cedait sa place a la
 * version corrigee d'un plus ancien. La correction ne passe donc que si la
 * banniere sous son tag est la SIENNE et que son texte change.
 *
 * Une banniere posee avant que la coque ne la marque n'a pas d'identifiant :
 * elle garde le comportement d'avant, FCM l'affiche.
 */
final class NotificationCorrectionRules {

    /** L'identifiant que la coque pose sur chaque banniere qu'elle reprend. */
    static final String EXTRA_NOTIFICATION_ID = "me.meeshy.app.banner.NOTIFICATION_ID";

    static final class Shown {
        final String notificationId;
        final String title;
        final String body;

        Shown(String notificationId, String title, String body) {
            this.notificationId = notificationId;
            this.title = title;
            this.body = body;
        }
    }

    private NotificationCorrectionRules() {}

    static boolean isCorrection(Map<String, String> extras) {
        return "true".equals(trimmed(extras.get("reproduced")))
            && NotificationFunnelRules.fcmDisplays(extras)
            && !NotificationFunnelRules.bannerTag(extras).isEmpty();
    }

    /** `shown` : la banniere affichee sous le tag de la correction, `null` s'il n'y en a pas. */
    static boolean shows(Map<String, String> extras, Shown shown) {
        if (!isCorrection(extras)) return true;
        if (shown == null) return false;
        String shownId = trimmed(shown.notificationId);
        if (shownId.isEmpty()) return true;
        if (!shownId.equals(trimmed(extras.get("notificationId")))) return false;
        return !trimmed(shown.title).equals(notificationField(extras, "title"))
            || !trimmed(shown.body).equals(notificationField(extras, "body"));
    }

    /**
     * #12479 — D-11 point 4, jumeau de `sw-push.js` § banniereAffichee : un
     * push livre deux fois (la passerelle relance un envoi FCM deja accepte)
     * ne sonne pas une seconde fois quand la banniere de SA notification est
     * encore affichee. Une correction suit {@link #shows}.
     */
    static boolean repeats(Map<String, String> extras, Shown shown) {
        if (shown == null || isCorrection(extras) || !NotificationFunnelRules.fcmDisplays(extras)) return false;
        String id = trimmed(extras.get("notificationId"));
        return !id.isEmpty() && id.equals(trimmed(shown.notificationId));
    }

    private static String notificationField(Map<String, String> extras, String name) {
        String full = trimmed(extras.get("gcm.notification." + name));
        return full.isEmpty() ? trimmed(extras.get("gcm.n." + name)) : full;
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }
}
