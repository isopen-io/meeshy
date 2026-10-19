package me.meeshy.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * L'ENTONNOIR D'UNE BANNIERE POSEE PAR FCM, APP FERMEE (#10938) — jumeau de
 * `sw-push.js` § evenementDeNotification / noterReception et de
 * `notificationEventOf` (`notification-telemetry.ts`).
 *
 * App hors du premier plan, une charge a bloc `notification` est affichee par
 * FCM lui-meme : `onMessageReceived` n'est pas appele, le plugin ne voit rien,
 * et la page non plus. Seul `handleIntent` voit passer le push ; il note ici
 * `received` puis `displayed`. Au premier plan, FCM n'affiche rien et la page
 * note deja `received` (`shell-push.ts`) : rien de natif, rien de compte deux
 * fois.
 *
 * Une entree ne porte que l'identifiant de la notification, le post parent et
 * un type borne — jamais un titre ni un corps. Chaque champ est filtre par une
 * classe de caracteres sans guillemet ni barre oblique inverse : la ligne JSON
 * se compose donc sans echappement, et aucun texte libre ne peut la deformer.
 */
final class NotificationFunnelRules {

    static final int CAP = 100;

    /** Le canal par defaut du manifeste (`default_notification_channel_id`). */
    static final String DEFAULT_CHANNEL = "meeshy_notifications";
    /** `NotificationManager.IMPORTANCE_NONE` : un canal que l'utilisateur a coupe. */
    private static final int IMPORTANCE_NONE = 0;

    private static final Pattern OBJECT_ID = Pattern.compile("^[0-9a-fA-F]{24}$");
    private static final Pattern TECHNICAL_CODE = Pattern.compile("^[A-Za-z0-9_.:-]{1,64}$");
    private static final Pattern EVENT_ID = Pattern.compile("^[A-Za-z0-9-]{1,64}$");
    private static final Pattern INSTANT = Pattern.compile("^[0-9T:.Z-]{1,40}$");
    private static final List<String> SHOWN = Arrays.asList("received", "displayed");

    private NotificationFunnelRules() {}

    /** FCM affiche la banniere quand la charge porte un bloc `notification`. */
    static boolean fcmDisplays(Map<String, String> extras) {
        for (String key : extras.keySet()) {
            if (key.startsWith("gcm.notification.") || key.startsWith("gcm.n.")) return true;
        }
        return false;
    }

    /**
     * #11054 — FCM livre le push meme quand le systeme ne montrera rien : les
     * notifications de l'app coupees, ou son canal d'importance `NONE`. Une
     * importance inconnue (`null`, avant l'API 26 ou canal absent) laisse FCM
     * afficher. Jumeau de `banniereAffichee` dans `noterReception`.
     */
    static boolean systemShows(boolean notificationsEnabled, Integer channelImportance) {
        return notificationsEnabled && (channelImportance == null || channelImportance != IMPORTANCE_NONE);
    }

    /** Le canal sur lequel FCM pose la banniere — celui du push, sinon celui du manifeste. */
    static String channelOf(Map<String, String> extras) {
        String full = trimmed(extras.get("gcm.notification.android_channel_id"));
        String channel = full.isEmpty() ? trimmed(extras.get("gcm.n.android_channel_id")) : full;
        return channel.isEmpty() ? DEFAULT_CHANNEL : channel;
    }

    static List<String> eventsFor(Map<String, String> extras, boolean inForeground, String occurredAt, Supplier<String> ids) {
        return eventsFor(extras, inForeground, true, occurredAt, ids);
    }

    /** `displayed` faux : une correction retenue (#10989) ou masquee par le systeme (#11054) — recue, jamais affichee, comme `noterReception`. */
    static List<String> eventsFor(Map<String, String> extras, boolean inForeground, boolean displayed, String occurredAt, Supplier<String> ids) {
        if (inForeground || !fcmDisplays(extras)) return Collections.emptyList();
        List<String> lines = new ArrayList<>();
        for (String action : displayed ? SHOWN : SHOWN.subList(0, 1)) {
            String line = line(extras, action, ids.get(), occurredAt);
            if (line != null) lines.add(line);
        }
        return lines;
    }

    static String line(Map<String, String> data, String action, String eventId, String occurredAt) {
        String id = trimmed(data.get("notificationId"));
        if (!OBJECT_ID.matcher(id).matches() || !EVENT_ID.matcher(eventId).matches() || !INSTANT.matcher(occurredAt).matches()) {
            return null;
        }
        String postId = trimmed(data.get("postId"));
        String type = trimmed(data.get("type"));
        String parent = OBJECT_ID.matcher(postId).matches() ? ",\"parent\":{\"kind\":\"post\",\"id\":\"" + postId + "\"}" : "";
        String notificationType = TECHNICAL_CODE.matcher(type).matches() ? ",\"notificationType\":\"" + type + "\"" : "";
        return "{\"type\":\"notification\",\"action\":\"" + action + "\",\"eventId\":\"" + eventId
            + "\",\"occurredAt\":\"" + occurredAt + "\",\"target\":{\"kind\":\"notification\",\"id\":\"" + id + "\"" + parent
            + "},\"surface\":\"notifications\",\"channel\":\"fcm\"" + notificationType + "}";
    }

    /** Les seules cles qu'une ligne lit : ce que les intentions de balayage et d'action transportent, et rien d'autre. */
    private static final List<String> LINE_KEYS = Arrays.asList("notificationId", "postId", "type");

    /**
     * #10921 — balayer la banniere note `dismissed`, comme `notificationclose`
     * sur le web. Le systeme n'appelle l'intention de suppression que pour un
     * geste de l'utilisateur (balayer, tout effacer) : ni le toucher, ni un
     * retrait par la coque.
     */
    static String dismissedLine(Map<String, String> data, String occurredAt, Supplier<String> ids) {
        return line(data, "dismissed", ids.get(), occurredAt);
    }

    /**
     * #11052 — toucher une action de la banniere note `opened`, comme
     * `notificationclick` sur le web pour TOUT toucher. Le corps est deja
     * compte par la page (`pushNotificationActionPerformed`) : seules les
     * actions que la coque pose passent ici.
     */
    static String openedLine(Map<String, String> data, String occurredAt, Supplier<String> ids) {
        return line(data, "opened", ids.get(), occurredAt);
    }

    /** Le tag sous lequel FCM a pose la banniere — celui ou la coque la retrouve. */
    static String bannerTag(Map<String, String> data) {
        String tag = trimmed(data.get("gcm.notification.tag"));
        return tag.isEmpty() ? trimmed(data.get("gcm.n.tag")) : tag;
    }

    static boolean tracksDismissal(Map<String, String> data) {
        return !bannerTag(data).isEmpty() && OBJECT_ID.matcher(trimmed(data.get("notificationId"))).matches();
    }

    static Map<String, String> lineExtras(Map<String, String> data) {
        Map<String, String> carried = new HashMap<>();
        for (String key : LINE_KEYS) {
            String value = data.get(key);
            if (value != null) carried.put(key, value);
        }
        return carried;
    }

    /** Le magasin apres ajout : les `cap` entrees les plus recentes, une par ligne. */
    static String appended(String stored, List<String> added, int cap) {
        List<String> all = new ArrayList<>(lines(stored));
        all.addAll(added);
        return String.join("\n", all.subList(Math.max(0, all.size() - cap), all.size()));
    }

    static List<String> lines(String stored) {
        if (stored == null || stored.isEmpty()) return Collections.emptyList();
        return Arrays.asList(stored.split("\n"));
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }
}
