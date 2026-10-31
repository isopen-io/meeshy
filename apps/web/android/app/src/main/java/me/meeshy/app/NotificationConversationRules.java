package me.meeshy.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * #12473 — la banniere d'une conversation, comme iOS l'empile par fil.
 *
 * La passerelle pose un tag par conversation (#8171) : chaque push REMPLACAIT
 * la banniere precedente, et trois vocaux n'en laissaient voir qu'un. La coque
 * relit donc les lignes de la banniere avant que FCM ne la remplace, et la
 * repose en `MessagingStyle` avec la nouvelle ligne au bout. Une correction
 * (meme notification) reprend SA ligne. Seules les dernieres lignes restent.
 *
 * Le visage de l'expediteur (`senderAvatar`) n'est telecharge que d'un hote
 * Meeshy ({@link WidgetAvatarRules#isFetchable}), et jamais sous
 * `notificationLocKey` ni pour un contenu chiffre : une garde de
 * confidentialite echoue en montrant MOINS, comme `bannerImage` cote passerelle.
 */
final class NotificationConversationRules {

    static final int MAX_LINES = 6;

    private NotificationConversationRules() {}

    /** Une ligne de la banniere : la notification qui l'a posee, l'expediteur, le texte, l'heure. */
    static final class Line {
        final String id;
        final String sender;
        final String text;
        final long timeMs;

        Line(String id, String sender, String text, long timeMs) {
            this.id = id;
            this.sender = sender;
            this.text = text;
            this.timeMs = timeMs;
        }
    }

    /** L'adresse du visage a telecharger, resolue contre la passerelle, ou `null`. */
    static String avatarUrl(Map<String, String> data, String apiBase, boolean debug) {
        if (data == null) return null;
        if (!blank(data.get("notificationLocKey")) || !blank(data.get("encryptedContent"))) return null;
        String raw = data.get("senderAvatar");
        if (blank(raw)) return null;
        String url = raw.trim();
        if (url.startsWith("/")) {
            if (blank(apiBase)) return null;
            try {
                url = new URI(apiBase.trim()).resolve(url).toString();
            } catch (URISyntaxException | IllegalArgumentException unreadable) {
                return null;
            }
        }
        return WidgetAvatarRules.isFetchable(url, debug) ? url : null;
    }

    /** Les lignes precedentes, la nouvelle au bout ; une correction reprend sa ligne. */
    static List<Line> stack(List<Line> previous, Line current) {
        List<Line> lines = new ArrayList<>();
        boolean replaced = false;
        if (previous != null) {
            for (Line line : previous) {
                if (current != null && current.id != null && current.id.equals(line.id)) {
                    if (!blank(current.text)) lines.add(current);
                    replaced = true;
                } else {
                    lines.add(line);
                }
            }
        }
        if (!replaced && current != null && !blank(current.text)) lines.add(current);
        return lines.size() <= MAX_LINES ? lines : new ArrayList<>(lines.subList(lines.size() - MAX_LINES, lines.size()));
    }

    // Les lignes voyagent dans les extras de la banniere, en tableaux paralleles.

    static String[] ids(List<Line> lines) {
        String[] out = new String[lines.size()];
        for (int i = 0; i < out.length; i++) out[i] = lines.get(i).id;
        return out;
    }

    static String[] senders(List<Line> lines) {
        String[] out = new String[lines.size()];
        for (int i = 0; i < out.length; i++) out[i] = lines.get(i).sender;
        return out;
    }

    static String[] texts(List<Line> lines) {
        String[] out = new String[lines.size()];
        for (int i = 0; i < out.length; i++) out[i] = lines.get(i).text;
        return out;
    }

    static long[] times(List<Line> lines) {
        long[] out = new long[lines.size()];
        for (int i = 0; i < out.length; i++) out[i] = lines.get(i).timeMs;
        return out;
    }

    /** Des extras incoherents (une version plus ancienne, une banniere etrangere) ne donnent rien. */
    static List<Line> decode(String[] ids, String[] senders, String[] texts, long[] times) {
        if (ids == null || senders == null || texts == null || times == null) return Collections.emptyList();
        int n = texts.length;
        if (ids.length != n || senders.length != n || times.length != n) return Collections.emptyList();
        List<Line> lines = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (!blank(texts[i])) lines.add(new Line(ids[i], senders[i], texts[i], times[i]));
        }
        return lines;
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
