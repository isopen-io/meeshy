package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/**
 * Les actions de la banniere d'un message, aux memes conditions que
 * `sw-push.js` (`offreContenu`) : « Repondre » (#10891), par le lien du widget
 * de reponse ; « Ouvrir la carte » et « Rejoindre » (#10906).
 */
public class NotificationBannerRulesTest {

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
        NotificationBannerRules.Action reply = NotificationBannerRules.replyOf(message());
        assertEquals("Répondre", reply.label);
        assertEquals("meeshy://c/65f0c0ffee0000000000abcd?compose=1", reply.link);
        assertEquals(WidgetActionRules.replyLink("65f0c0ffee0000000000abcd"), reply.link);
        assertEquals("conv-65f0c0ffee0000000000abcd", reply.tag);
    }

    @Test
    public void everyReplyableTypeOffersIt() {
        for (String type : new String[] {"new_message", "message_reply", "reply", "user_mentioned", "message_forwarded"}) {
            assertEquals(type, "Répondre", NotificationBannerRules.replyOf(with("type", type)).label);
        }
    }

    @Test
    public void otherNotificationsDoNot() {
        assertNull(NotificationBannerRules.replyOf(with("type", "post_like")));
        assertNull(NotificationBannerRules.replyOf(with("type", "call")));
        assertNull(NotificationBannerRules.replyOf(with("type", null)));
    }

    @Test
    public void withoutTheLocalizedLabelOrTheConversationThereIsNothingToOffer() {
        assertNull(NotificationBannerRules.replyOf(with("replyActionLabel", null)));
        assertNull(NotificationBannerRules.replyOf(with("replyActionLabel", "  ")));
        assertNull(NotificationBannerRules.replyOf(with("conversationId", null)));
        assertNull(NotificationBannerRules.replyOf(with("conversationId", "../../x")));
    }

    @Test
    public void theBannerIsFoundByTheTagFcmGaveIt() {
        Map<String, String> legacy = with("gcm.notification.tag", null);
        legacy.put("gcm.n.tag", "conv-legacy");
        assertEquals("conv-legacy", NotificationBannerRules.replyOf(legacy).tag);
        assertNull(NotificationBannerRules.replyOf(with("gcm.notification.tag", null)));
    }

    @Test
    public void aProtectedMessageStillOffersIt() {
        Map<String, String> data = with("notificationLocKey", "notification.protected.viewOnce");
        assertEquals("Répondre", NotificationBannerRules.replyOf(data).label);
    }

    private static Map<String, String> place(String lat, String lon, String name) {
        Map<String, String> data = message();
        data.put("contentActionLabel", "Ouvrir la carte");
        data.put("locationLat", lat);
        data.put("locationLon", lon);
        if (name != null) data.put("locationName", name);
        return data;
    }

    private static Map<String, String> invite(String url) {
        Map<String, String> data = message();
        data.put("contentActionLabel", "Rejoindre");
        data.put("inviteUrl", url);
        return data;
    }

    @Test
    public void aPlaceOpensThePhoneMapsAppLikeTheThreadDoes() {
        NotificationBannerRules.Action map = NotificationBannerRules.contentOf(place("48.8584", "2.2945", "Tour Eiffel (Paris)"));
        assertEquals("Ouvrir la carte", map.label);
        assertEquals("geo:48.85840,2.29450?q=48.85840,2.29450(Tour%20Eiffel%20%28Paris%29)", map.link);
        assertFalse(map.inApp);
        assertEquals("conv-65f0c0ffee0000000000abcd", map.tag);
        assertEquals("geo:-33.86880,151.20930?q=-33.86880,151.20930",
            NotificationBannerRules.contentOf(place("-33.8688", "151.2093", null)).link);
    }

    @Test
    public void aPlaceOutsideTheGlobeOffersNothing() {
        assertNull(NotificationBannerRules.contentOf(place("91", "2", null)));
        assertNull(NotificationBannerRules.contentOf(place("48", "181", null)));
        assertNull(NotificationBannerRules.contentOf(place("", "2", null)));
        assertNull(NotificationBannerRules.contentOf(place("abc", "2", null)));
    }

    @Test
    public void anInvitationOpensTheJoinScreenInTheApp() {
        NotificationBannerRules.Action join = NotificationBannerRules.contentOf(invite("https://meeshy.me/chat/AbC_12-x"));
        assertEquals("Rejoindre", join.label);
        assertEquals("meeshy://chat/AbC_12-x", join.link);
        assertTrue(join.inApp);
        assertEquals("meeshy://chat/k1", NotificationBannerRules.contentOf(invite("https://staging.meeshy.me/join/k1")).link);
        assertEquals("meeshy://chat/k2", NotificationBannerRules.contentOf(invite("meeshy://chat/k2")).link);
    }

    @Test
    public void onlyAMeeshyInvitationIsFollowed() {
        assertNull(NotificationBannerRules.contentOf(invite("https://evil.example/chat/k1")));
        assertNull(NotificationBannerRules.contentOf(invite("https://meeshy.me.evil.example/chat/k1")));
        assertNull(NotificationBannerRules.contentOf(invite("http://meeshy.me/chat/k1")));
        assertNull(NotificationBannerRules.contentOf(invite("https://meeshy.me/u/k1")));
        assertNull(NotificationBannerRules.contentOf(invite("https://meeshy.me/chat/../x")));
        assertNull(NotificationBannerRules.contentOf(invite("::")));
    }

    @Test
    public void aProtectedMessageSaysNothingOfItsContent() {
        Map<String, String> hidden = place("48.8584", "2.2945", null);
        hidden.put("notificationLocKey", "notification.protected.viewOnce");
        assertNull(NotificationBannerRules.contentOf(hidden));
        assertNull(NotificationBannerRules.contentOf(with("contentActionLabel", null)));
    }

    @Test
    public void aPlaceWinsOverAnInvitationLikeOnTheWeb() {
        Map<String, String> both = place("1", "2", null);
        both.put("inviteUrl", "https://meeshy.me/chat/k1");
        assertEquals("geo:1.00000,2.00000?q=1.00000,2.00000", NotificationBannerRules.contentOf(both).link);
    }
}
