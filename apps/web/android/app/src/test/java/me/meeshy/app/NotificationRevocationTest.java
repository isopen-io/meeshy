package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/** Le push de controle `notification_revoked` dans la coque, jumeau de `NotificationRevocation.kt` (#8624). */
public class NotificationRevocationTest {

    private static Map<String, String> revocation(String ids, String conversations, String types) {
        Map<String, String> data = new HashMap<>();
        data.put("type", "notification_revoked");
        if (ids != null) data.put("notificationIds", ids);
        if (conversations != null) data.put("conversationIds", conversations);
        if (types != null) data.put("types", types);
        return data;
    }

    @Test
    public void everyRevokedNotificationLosesItsOwnBanner() {
        assertEquals(Arrays.asList("n1", "n2"), NotificationRevocation.tagsToCancel(revocation("n1,n2", null, null)));
    }

    // #12523 — sous le tag d'une conversation s'affiche le DERNIER message : seule une banniere sans marque y part, comme sur le web.

    @Test
    public void aRevokedMessageArrivalOnlyLooksAtTheBannerOfItsConversation() {
        Map<String, String> data = revocation("n1,n2", "c1,c2", "new_message,message_reply");
        assertEquals(Arrays.asList("n1", "n2"), NotificationRevocation.tagsToCancel(data));
        assertEquals(Arrays.asList("c1", "c2"), NotificationRevocation.conversationTags(data));
    }

    @Test
    public void theBannerOfANewerMessageOfTheConversationStaysLikeOnTheWeb() {
        assertFalse(NotificationRevocation.closesConversationBanner("n9"));
        assertTrue(NotificationRevocation.closesConversationBanner(null));
        assertTrue(NotificationRevocation.closesConversationBanner(" "));
    }

    @Test
    public void aRevokedReactionNeverCancelsTheBannerOfTheMessageItReactedTo() {
        Map<String, String> data = revocation("n1", "c1", "message_reaction");
        assertEquals(Arrays.asList("n1"), NotificationRevocation.tagsToCancel(data));
        assertTrue(NotificationRevocation.conversationTags(data).isEmpty());
    }

    @Test
    public void aLineWithoutConversationOnlyCancelsItsNotification() {
        Map<String, String> data = revocation("n1,n2", ",c2", "new_message,new_message");
        assertEquals(Arrays.asList("n1", "n2"), NotificationRevocation.tagsToCancel(data));
        assertEquals(Arrays.asList("c2"), NotificationRevocation.conversationTags(data));
    }

    @Test
    public void aSharedConversationIsCancelledOnce() {
        assertEquals(
            Arrays.asList("c1"),
            NotificationRevocation.conversationTags(revocation("n1,n2", "c1,c1", "new_message,new_message"))
        );
    }

    @Test
    public void anyOtherPushOrAnEmptyRevocationCancelsNothing() {
        Map<String, String> message = new HashMap<>();
        message.put("type", "new_message");
        message.put("notificationIds", "n1");
        assertTrue(NotificationRevocation.tagsToCancel(message).isEmpty());
        assertTrue(NotificationRevocation.tagsToCancel(revocation(null, null, null)).isEmpty());
        assertTrue(NotificationRevocation.tagsToCancel(revocation(",,", null, null)).isEmpty());
        assertTrue(NotificationRevocation.conversationTags(message).isEmpty());
        assertTrue(NotificationRevocation.conversationTags(revocation(",", "c1,", "new_message,")).isEmpty());
    }

    // #11032 — comme le web (`banner-revocation.ts`), la banniere MARQUEE d'une notification revoquee part, quel que soit son tag.

    @Test
    public void aBannerMarkedWithARevokedNotificationIsClosedWhateverItsTag() {
        Map<String, String> data = revocation("n1,n2", "c1,", "message_reaction,post_like");
        assertTrue(NotificationRevocation.closesMarked(data, "n1"));
        assertTrue(NotificationRevocation.closesMarked(data, " n2 "));
    }

    @Test
    public void theBannerOfAnotherNotificationOfTheThreadStays() {
        Map<String, String> data = revocation("n1", "c1", "message_reaction");
        assertFalse(NotificationRevocation.closesMarked(data, "n9"));
        assertFalse(NotificationRevocation.closesMarked(data, null));
        assertFalse(NotificationRevocation.closesMarked(data, ""));
    }

    @Test
    public void onlyARevocationClosesAMarkedBanner() {
        Map<String, String> data = revocation("n1", null, null);
        data.put("type", "new_message");
        assertFalse(NotificationRevocation.closesMarked(data, "n1"));
        assertFalse(NotificationRevocation.closesMarked(revocation(",", null, null), ""));
    }
}
