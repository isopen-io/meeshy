package me.meeshy.app;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * #10891 — quand la banniere d'un message offre « Repondre ». Memes conditions
 * que le service worker web (`sw-push.js`, `offreContenu`) : un type de
 * message de conversation, le libelle que la passerelle a deja localise
 * (`contentActionPushFields.ts`) et la conversation. Un message protege
 * l'offre aussi : le libelle ne dit rien du contenu.
 *
 * Le lien est celui du widget de reponse ({@link WidgetActionRules#replyLink}) :
 * le fil s'ouvre et le composeur prend le focus par le chemin que la page lit
 * deja (`compose-focus.ts`).
 */
final class NotificationReplyRules {

    /** La banniere a retirer quand l'action est touchee. */
    static final String EXTRA_BANNER_TAG = "me.meeshy.app.reply.BANNER_TAG";

    /** JUMEAU de `REPLYABLE_TYPES` (`sw-push.js`, `contentActionPushFields.ts`). */
    private static final List<String> TYPES = Arrays.asList(
        "new_message", "message_reply", "reply", "user_mentioned", "message_forwarded");
    /** JUMEAU de `SHARE_LINK_KEY` (`sw-push.js`) : un identifiant, jamais un chemin. */
    private static final Pattern CONVERSATION = Pattern.compile("^[A-Za-z0-9_-]{1,100}$");

    private NotificationReplyRules() {}

    static final class Reply {
        final String label;
        final String link;
        final String tag;

        Reply(String label, String link, String tag) {
            this.label = label;
            this.link = link;
            this.tag = tag;
        }
    }

    /** L'action « Repondre » de cette charge, ou null si la banniere ne l'offre pas. */
    static Reply replyOf(Map<String, String> data) {
        if (data == null || !TYPES.contains(text(data.get("type")))) return null;
        String label = text(data.get("replyActionLabel"));
        String conversationId = text(data.get("conversationId"));
        if (label.isEmpty() || !CONVERSATION.matcher(conversationId).matches()) return null;
        String tag = text(data.get("gcm.notification.tag"));
        if (tag.isEmpty()) tag = text(data.get("gcm.n.tag"));
        if (tag.isEmpty()) return null;
        return new Reply(label, WidgetActionRules.replyLink(conversationId), tag);
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }
}
