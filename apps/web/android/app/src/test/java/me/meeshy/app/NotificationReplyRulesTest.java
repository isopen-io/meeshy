package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/**
 * #10891 — « Repondre » sur la banniere d'un message : les memes conditions que
 * `sw-push.js` (`offreContenu`), et le meme lien que le widget de reponse.
 */
public class NotificationReplyRulesTest {

    private static Map<String, String> message() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "new_message");
        data.put("conversationId", "65f0c0ffee0000000000abcd");
        data.put("replyActionLabel", "Répondre");
        data.put("gcm.notification.tag", "conv-65f0c0ffee0000000000abcd");
        return data;
    }

    private static Map<String, String> with(String key, String value) {
        Map<String, String> data = message();
        if (value == null) data.remove(key);
        else data.put(key, value);
        return data;
    }

    @Test
    public void aMessageBannerRepliesInItsConversationWithTheComposerFocused() {
        NotificationReplyRules.Reply reply = NotificationReplyRules.replyOf(message());
        assertEquals("Répondre", reply.label);
        assertEquals("meeshy://c/65f0c0ffee0000000000abcd?compose=1", reply.link);
        assertEquals(WidgetActionRules.replyLink("65f0c0ffee0000000000abcd"), reply.link);
        assertEquals("conv-65f0c0ffee0000000000abcd", reply.tag);
    }

    @Test
    public void everyReplyableTypeOffersIt() {
        for (String type : new String[] {"new_message", "message_reply", "reply", "user_mentioned", "message_forwarded"}) {
            assertEquals(type, "Répondre", NotificationReplyRules.replyOf(with("type", type)).label);
        }
    }

    @Test
    public void otherNotificationsDoNot() {
        assertNull(NotificationReplyRules.replyOf(with("type", "post_like")));
        assertNull(NotificationReplyRules.replyOf(with("type", "call")));
        assertNull(NotificationReplyRules.replyOf(with("type", null)));
    }

    @Test
    public void withoutTheLocalizedLabelOrTheConversationThereIsNothingToOffer() {
        assertNull(NotificationReplyRules.replyOf(with("replyActionLabel", null)));
        assertNull(NotificationReplyRules.replyOf(with("replyActionLabel", "  ")));
        assertNull(NotificationReplyRules.replyOf(with("conversationId", null)));
        assertNull(NotificationReplyRules.replyOf(with("conversationId", "../../x")));
    }

    @Test
    public void theBannerIsFoundByTheTagFcmGaveIt() {
        Map<String, String> legacy = with("gcm.notification.tag", null);
        legacy.put("gcm.n.tag", "conv-legacy");
        assertEquals("conv-legacy", NotificationReplyRules.replyOf(legacy).tag);
        assertNull(NotificationReplyRules.replyOf(with("gcm.notification.tag", null)));
    }

    @Test
    public void aProtectedMessageStillOffersIt() {
        Map<String, String> data = with("notificationLocKey", "notification.protected.viewOnce");
        assertEquals("Répondre", NotificationReplyRules.replyOf(data).label);
    }
}
