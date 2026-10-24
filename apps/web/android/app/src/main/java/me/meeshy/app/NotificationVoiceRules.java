package me.meeshy.app;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Un vocal recu s'ECOUTE depuis sa notification (#10641), le pendant Android
 * du lecteur de `MeeshyNotificationContentExtension` (iOS, #8856). Pure et
 * testee sur la JVM seule ; {@link NotificationVoiceBanner} pose l'action,
 * {@link NotificationVoiceService} joue.
 *
 * FAIL-CLOSED A DEUX NIVEAUX, comme la NSE : le serveur ne fait pas voyager
 * le media d'un message protege (`mediaMayTravel`, cycle 125) ET la coque lit
 * la DECLARATION de protection elle-meme — un `notificationLocKey` present,
 * un contenu chiffre, aucune adresse : pas d'action « Ecouter », aucun octet
 * telecharge.
 *
 * L'adresse lue est GARDEE (consigne de revue) : hotes Meeshy en `https`
 * seulement, plus l'hote d'API que la page a configure ; aucune IP litterale ;
 * `http` reserve au bouclage de l'emulateur d'un build de debug. Chaque saut
 * de redirection est revalide, le type servi doit etre audio et le fichier
 * borne a {@link #MAX_BYTES}.
 */
final class NotificationVoiceRules {

    /** Un vocal tient en quelques centaines de Ko ; une heure en AAC tient sous 30 Mo. */
    static final long MAX_BYTES = 30L * 1024 * 1024;
    static final int MAX_REDIRECTS = 3;
    private static final int MAX_STRETCHES = 50;

    /** JUMEAU de `PushDeliveryReceipt.TYPES` restreint a ceux qui portent un message. */
    private static final List<String> TYPES = Arrays.asList(
        "new_message", "message_reply", "reply", "message_forwarded", "user_mentioned"
    );

    private static final Pattern IPV4 = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");
    /** JUMEAU de `wireLanguageCode` (`services/gateway/src/validation/messages-schemas.ts`) : bas, dua, pt-br (#11376). */
    private static final Pattern LANGUAGE = Pattern.compile("^[a-z]{2,3}([-_][a-z0-9]+)*$");
    private static final int MAX_LANGUAGE_CHARS = 16;

    private NotificationVoiceRules() {}

    /** Ce que la notification d'un vocal ecoutable porte. */
    static final class Voice {
        final String url;
        final String attachmentId;
        final String messageId;
        final String conversationId;
        final String conversationTitle;
        final String author;
        final String language;
        final String tag;
        final long durationMs;

        Voice(String url, String attachmentId, String messageId, String conversationId, String conversationTitle,
              String author, String language, String tag, long durationMs) {
            this.url = url;
            this.attachmentId = attachmentId;
            this.messageId = messageId;
            this.conversationId = conversationId;
            this.conversationTitle = conversationTitle;
            this.author = author;
            this.language = language;
            this.tag = tag;
            this.durationMs = durationMs;
        }
    }

    /** Un segment ecoute d'une traite, la forme de `AttachmentStatusBodySchema.stretches`. */
    static final class Stretch {
        final long startMs;
        final long endMs;
        final String endedBy;

        Stretch(long startMs, long endMs, String endedBy) {
            this.startMs = startMs;
            this.endMs = endMs;
            this.endedBy = endedBy;
        }
    }

    /** Le vocal de cette charge, ou null s'il ne s'ecoute pas — sans juger son adresse. */
    static Voice voiceOf(Map<String, String> data) {
        if (!TYPES.contains(text(data.get("type")))) return null;
        if (!text(data.get("notificationLocKey")).isEmpty()) return null;
        if (!text(data.get("encryptedContent")).isEmpty()) return null;
        String url = text(data.get("attachmentUrl"));
        if (url.isEmpty()) return null;
        if (!text(data.get("attachmentMimeType")).toLowerCase(Locale.ROOT).startsWith("audio/")) return null;
        String conversationId = text(data.get("conversationId"));
        String messageId = text(data.get("messageId"));
        if (conversationId.isEmpty() || messageId.isEmpty()) return null;
        String author = text(data.get("senderDisplayName"));
        if (author.isEmpty()) author = text(data.get("senderUsername"));
        String tag = text(data.get("gcm.notification.tag"));
        if (tag.isEmpty()) tag = text(data.get("gcm.n.tag"));
        return new Voice(url, text(data.get("attachmentId")), messageId, conversationId,
            text(data.get("conversationTitle")), author, text(data.get("attachmentLanguage")), tag,
            millis(data.get("attachmentDurationMs")));
    }

    /** {@link #voiceOf}, plus la garde de l'adresse : ce que la notification offre a l'ecoute. */
    static Voice listenable(Map<String, String> data, String apiBase, boolean debug) {
        Voice voice = voiceOf(data);
        if (voice == null || !allowedMediaUrl(voice.url, apiBase, debug)) return null;
        return voice;
    }

    static boolean allowedMediaUrl(String url, String apiBase, boolean debug) {
        URI uri = parse(url);
        if (uri == null || uri.getRawUserInfo() != null) return false;
        String scheme = text(uri.getScheme()).toLowerCase(Locale.ROOT);
        String host = text(uri.getHost()).toLowerCase(Locale.ROOT);
        if (host.isEmpty()) return false;
        if ("http".equals(scheme)) return debug && ("localhost".equals(host) || "10.0.2.2".equals(host));
        if (!"https".equals(scheme) || ipLiteral(host)) return false;
        if (host.equals("meeshy.me") || host.endsWith(".meeshy.me")) return true;
        return host.equals(configuredHost(apiBase));
    }

    /** La cible d'un `Location`, resolue contre l'adresse qui l'a rendue puis regardee, ou null. */
    static String redirectTarget(String from, String location, String apiBase, boolean debug) {
        URI origin = parse(from);
        if (origin == null || location == null || location.trim().isEmpty()) return null;
        try {
            String target = origin.resolve(location.trim()).toString();
            return allowedMediaUrl(target, apiBase, debug) ? target : null;
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }

    static boolean servedAudio(String contentType) {
        return contentType != null && contentType.trim().toLowerCase(Locale.ROOT).startsWith("audio/");
    }

    /** `-1` : longueur non annoncee, bornee pendant la lecture du flux. */
    static boolean lengthAcceptable(long declared) {
        return declared <= MAX_BYTES;
    }

    /** « 0:16 », « 1:02:03 » — la duree d'une bulle ; vide quand elle est inconnue. */
    static String duration(long ms) {
        if (ms < 0) return "";
        long seconds = ms / 1000;
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;
        long rest = seconds % 60;
        if (hours > 0) return String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, rest);
        return String.format(Locale.ROOT, "%d:%02d", minutes, rest);
    }

    /**
     * #12473 — « Ecouter » ⇄ « Pause » dans la langue de la banniere, que la
     * passerelle envoie avec « Repondre » ; les ressources de la coque, qui
     * suivent la langue de l'appareil, ne servent qu'en repli.
     */
    static String actionLabel(Map<String, String> data, boolean playing, String fallback) {
        String sent = data == null ? null : data.get(playing ? "pauseActionLabel" : "listenActionLabel");
        String label = sent == null ? "" : sent.trim();
        return label.isEmpty() ? fallback : label;
    }

    static String playerTitle(Voice voice, String fallback) {
        return voice.author.isEmpty() ? fallback : voice.author;
    }

    static String playerSubtitle(Voice voice) {
        return voice.conversationTitle;
    }

    /** `POST {apiBase}/api/v1/attachments/:id/status` — `attachmentsEndpoints.byAttachmentIdStatus`. */
    static String reportUrl(String apiBase, String attachmentId) {
        if (apiBase == null || attachmentId == null || attachmentId.trim().isEmpty()) return null;
        String base = apiBase.trim();
        if (!base.startsWith("https://") && !base.startsWith("http://")) return null;
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        try {
            String id = URLEncoder.encode(attachmentId.trim(), "UTF-8").replace("+", "%20");
            return base + "/api/v1/attachments/" + id + "/status";
        } catch (UnsupportedEncodingException impossible) {
            return null;
        }
    }

    /**
     * Le corps du rapport d'ecoute, celui que la page envoie
     * (`use-media-playback.ts` § attemptReport) : les champs inconnus sont
     * OMIS, jamais vides — le wire rejetterait le rapport entier.
     */
    static String reportBody(long positionMs, long durationMs, boolean complete, List<Stretch> stretches, String language) {
        StringBuilder body = new StringBuilder("{\"action\":\"listened\",\"playPositionMs\":")
            .append(Math.max(0, positionMs))
            .append(",\"complete\":").append(complete);
        if (durationMs > 0) body.append(",\"durationMs\":").append(durationMs);
        List<Stretch> trace = usable(stretches);
        if (!trace.isEmpty()) {
            body.append(",\"stretches\":[");
            for (int i = 0; i < trace.size(); i++) {
                Stretch s = trace.get(i);
                if (i > 0) body.append(',');
                body.append("{\"startMs\":").append(s.startMs)
                    .append(",\"endMs\":").append(s.endMs)
                    .append(",\"endedBy\":\"").append(s.endedBy).append("\"}");
            }
            body.append(']');
        }
        String lang = text(language).trim().toLowerCase(Locale.ROOT);
        if (lang.length() <= MAX_LANGUAGE_CHARS && LANGUAGE.matcher(lang).matches()) body.append(",\"language\":\"").append(lang).append('"');
        return body.append('}').toString();
    }

    /**
     * Les segments que le serveur garde (`endMs > startMs` strict), plafonnes
     * comme la page (`capStretches`) : les plus COURTS tombent, l'ordre
     * chronologique des rescapes est preserve.
     */
    static List<Stretch> usable(List<Stretch> stretches) {
        List<Stretch> kept = new ArrayList<>();
        for (Stretch s : stretches) if (s.startMs >= 0 && s.endMs > s.startMs) kept.add(s);
        if (kept.size() <= MAX_STRETCHES) return kept;
        List<Stretch> longest = new ArrayList<>(kept);
        Collections.sort(longest, Comparator.comparingLong((Stretch s) -> s.endMs - s.startMs).reversed());
        List<Stretch> survivors = longest.subList(0, MAX_STRETCHES);
        List<Stretch> ordered = new ArrayList<>();
        for (Stretch s : kept) if (survivors.contains(s)) ordered.add(s);
        return ordered;
    }


    // ── Compte et environnement (revue adversariale #10641) ─────────────────

    /**
     * L'EMPREINTE du compte du credential pose par la page — jamais le jeton.
     * Un compte inscrit est son `userId` (claim de `signSessionToken`), stable
     * d'un rafraichissement a l'autre ; un jeton illisible ou anonyme est son
     * condensat. Null sans credential reconnu (`CallShellRules.credentialHeader`).
     */
    static String accountOf(String kind, String token) {
        if (token == null || token.trim().isEmpty()) return null;
        if ("registered".equals(kind)) {
            String user = jwtUser(token.trim());
            return user != null ? "u:" + digest(user) : "r:" + digest(token.trim());
        }
        if ("anonymous".equals(kind)) return "a:" + digest(token.trim());
        return null;
    }

    /** Le compte ET l'environnement : un rapport ou une ecoute ne servent que les leurs. */
    static String origin(String apiBase, String kind, String token) {
        String account = accountOf(kind, token);
        if (account == null || apiBase == null) return null;
        String base = apiBase.trim().toLowerCase(Locale.ROOT);
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (!base.startsWith("https://") && !base.startsWith("http://")) return null;
        return account + "|" + base;
    }

    /** Fail-closed : deux origines inconnues ne se valent pas. */
    static boolean sameOrigin(String recorded, String current) {
        return recorded != null && recorded.equals(current);
    }

    /** Un telechargement acheve ne se prepare que pour le vocal encore demande, dans un service vivant. */
    static boolean mayPrepare(boolean destroyed, String targetMessageId, String currentMessageId) {
        return !destroyed && targetMessageId != null && targetMessageId.equals(currentMessageId);
    }

    /**
     * La banniere retrouvee par son tag (la conversation) est-elle celle de CE
     * message ? A l'offre, une banniere encore vierge (FCM vient de la poser)
     * l'est ; ensuite, seule celle qui porte son identite.
     */
    static boolean bannerMatches(String stampedMessageId, String messageId, boolean offering) {
        if (stampedMessageId == null) return offering;
        return stampedMessageId.equals(messageId);
    }

    /**
     * `lock_screen_allow_private_notifications` : 1 seulement montre auteur et
     * conversation sur l'ecran verrouille. Illisible ou absent : rien ne se
     * nomme (fail-closed).
     */
    static boolean revealOnLockScreen(int allowPrivateNotifications) {
        return allowPrivateNotifications == 1;
    }

    private static String jwtUser(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) return null;
        try {
            String json = new String(base64Url(parts[1]), java.nio.charset.StandardCharsets.UTF_8);
            String user = new org.json.JSONObject(json).optString("userId", "");
            return user.isEmpty() ? null : user;
        } catch (Exception unreadable) {
            return null;
        }
    }

    /** `java.util.Base64` n'existe qu'a l'API 26 (minSdk 24) : le decodeur base64url, a la main. */
    private static byte[] base64Url(String text) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buffer = 0;
        int bits = 0;
        for (char c : text.toCharArray()) {
            if (c == '=') break;
            int value = alphabet.indexOf(c == '+' ? '-' : c == '/' ? '_' : c);
            if (value < 0) throw new IllegalArgumentException("base64url");
            buffer = (buffer << 6) | value;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.write((buffer >> bits) & 0xff);
            }
        }
        return out.toByteArray();
    }

    private static String digest(String value) {
        try {
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 16; i++) hex.append(String.format(Locale.ROOT, "%02x", hash[i]));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private static String configuredHost(String apiBase) {
        URI uri = parse(apiBase);
        if (uri == null || !"https".equalsIgnoreCase(text(uri.getScheme()))) return null;
        String host = text(uri.getHost()).toLowerCase(Locale.ROOT);
        return host.isEmpty() || ipLiteral(host) ? null : host;
    }

    private static boolean ipLiteral(String host) {
        return host.contains(":") || host.startsWith("[") || IPV4.matcher(host).matches();
    }

    private static URI parse(String value) {
        if (value == null) return null;
        try {
            return new URI(value.trim());
        } catch (Exception malformed) {
            return null;
        }
    }

    private static long millis(String value) {
        try {
            long parsed = Long.parseLong(text(value));
            return parsed >= 0 ? parsed : -1;
        } catch (NumberFormatException absent) {
            return -1;
        }
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }
}
