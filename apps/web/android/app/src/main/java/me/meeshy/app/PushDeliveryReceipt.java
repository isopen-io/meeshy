package me.meeshy.app;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * L'ACCUSE DE REMISE d'un push recu par la coque (#8124) — jumeau de
 * `public/sw-push.js` § accuserRemise (web, #7368) et de
 * `NSEDataSync.postDeliveryReceipt` (iOS). Sans lui, l'auteur reste sur
 * « envoye » tant que ce destinataire Android n'a pas rouvert l'application,
 * quand le meme destinataire sur le web ou sur iOS le fait passer a « recu ».
 *
 * Pure et testee sur la JVM seule ; {@link MeeshyMessagingService} l'envoie
 * avec le credential que la page a pose ({@link CallShellStore}).
 */
final class PushDeliveryReceipt {

    /**
     * JUMEAU de `DELIVERY_RECEIPT_TYPES` (`public/sw-push.js`) : les reactions
     * et les evenements sociaux portent un `messageId` (celui du message REAGI)
     * sans etre une remise ; ils restent dehors.
     */
    static final List<String> TYPES = Arrays.asList(
        "new_message", "message_reply", "reply", "message_forwarded", "user_mentioned",
        "new_conversation", "new_conversation_direct", "new_conversation_group",
        "added_to_conversation"
    );

    final String url;
    final String body;

    private PushDeliveryReceipt(String url, String body) {
        this.url = url;
        this.body = body;
    }

    /** `POST {apiBase}/api/v1/conversations/:id/receipts`, ou null si ce push n'annonce aucune remise. */
    static PushDeliveryReceipt of(Map<String, String> data, String apiBase) {
        if (!TYPES.contains(text(data.get("type")))) return null;
        String conversationId = text(data.get("conversationId"));
        String messageId = text(data.get("messageId"));
        if (conversationId.isEmpty() || messageId.isEmpty() || apiBase == null) return null;
        String base = apiBase.trim();
        if (!base.startsWith("https://") && !base.startsWith("http://")) return null;
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        try {
            String path = URLEncoder.encode(conversationId, "UTF-8").replace("+", "%20");
            String body = "{\"type\":\"delivered\",\"messageIds\":[\"" + jsonEscape(messageId) + "\"]}";
            return new PushDeliveryReceipt(base + "/api/v1/conversations/" + path + "/receipts", body);
        } catch (UnsupportedEncodingException impossible) {
            return null;
        }
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }

    private static String jsonEscape(String value) {
        StringBuilder escaped = new StringBuilder(value.length());
        for (char c : value.toCharArray()) {
            if (c == '"' || c == '\\') escaped.append('\\').append(c);
            else if (c < 0x20) escaped.append(String.format("\\u%04x", (int) c));
            else escaped.append(c);
        }
        return escaped.toString();
    }
}
