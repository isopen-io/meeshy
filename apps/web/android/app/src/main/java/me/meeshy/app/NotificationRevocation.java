package me.meeshy.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * LE PUSH DE CONTROLE `notification_revoked` dans la coque (#8624) — jumeau de
 * `NotificationRevocation.kt` (app native) et de la NSE iOS. Contrat du gateway
 * (`services/notifications/notificationRevocationPush.ts`) :
 *
 *   notificationIds = "n1,n2"          les notifications retirees
 *   conversationIds = "c1,"            meme ordre ; vide sans conversation
 *   types           = "new_message,…"  meme ordre ; absent d'un gateway ancien
 *
 * Les bannieres de la coque sont dessinees par FCM sous `notify(tag, 0)`, avec
 * `tag = threadId || notificationId` (`android-push-config.ts`) — `threadId`
 * etant la conversation. On annule donc le tag de CHAQUE notification, et
 * celui de sa conversation SEULEMENT pour un arrivage de message : revoquer
 * une reaction ne doit jamais effacer la banniere du message courant du fil.
 *
 * Pure et testee sur la JVM seule ; {@link MeeshyMessagingService} annule.
 */
final class NotificationRevocation {

    static final String TYPE = "notification_revoked";

    private static final List<String> CONVERSATION_INDEXED = Arrays.asList("new_message", "message_reply");

    private NotificationRevocation() {}

    /** Les tags a annuler, sans doublon ; vide pour tout autre push ou une revocation sans id. */
    static List<String> tagsToCancel(Map<String, String> data) {
        if (!TYPE.equals(data.get("type"))) return Collections.emptyList();
        List<String> ids = split(data.get("notificationIds"));
        List<String> conversations = split(data.get("conversationIds"));
        List<String> types = split(data.get("types"));
        Set<String> tags = new LinkedHashSet<>();
        for (String id : ids) {
            if (!id.isEmpty()) tags.add(id);
        }
        if (tags.isEmpty()) return Collections.emptyList();
        for (int i = 0; i < ids.size(); i++) {
            String conversation = at(conversations, i);
            if (!conversation.isEmpty() && CONVERSATION_INDEXED.contains(at(types, i))) tags.add(conversation);
        }
        return new ArrayList<>(tags);
    }

    /**
     * #11032 — la banniere MARQUEE d'une notification revoquee
     * ({@link NotificationCorrectionRules#EXTRA_NOTIFICATION_ID}) part quel que
     * soit son tag, comme sur le web (`banner-revocation.ts`) : une reaction
     * a un message est affichee sous le tag de sa CONVERSATION, que l'annulation
     * par identifiant manquait. Celle d'une autre notification du fil reste.
     */
    static boolean closesMarked(Map<String, String> data, String marked) {
        if (!TYPE.equals(data.get("type")) || marked == null || marked.trim().isEmpty()) return false;
        for (String id : split(data.get("notificationIds"))) {
            if (id.trim().equals(marked.trim())) return true;
        }
        return false;
    }

    private static List<String> split(String joined) {
        return joined == null ? Collections.emptyList() : Arrays.asList(joined.split(",", -1));
    }

    private static String at(List<String> values, int index) {
        return index < values.size() ? values.get(index).trim() : "";
    }
}
