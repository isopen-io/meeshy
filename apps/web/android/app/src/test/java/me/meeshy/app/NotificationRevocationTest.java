package me.meeshy.app;

import static org.junit.Assert.assertEquals;
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

    @Test
    public void aRevokedMessageArrivalAlsoLosesTheBannerOfItsConversation() {
        assertEquals(
            Arrays.asList("n1", "n2", "c1", "c2"),
            NotificationRevocation.tagsToCancel(revocation("n1,n2", "c1,c2", "new_message,message_reply"))
        );
    }

    @Test
    public void aRevokedReactionNeverCancelsTheBannerOfTheMessageItReactedTo() {
        assertEquals(
            Arrays.asList("n1"),
            NotificationRevocation.tagsToCancel(revocation("n1", "c1", "message_reaction"))
        );
    }

    @Test
    public void aLineWithoutConversationOnlyCancelsItsNotification() {
        assertEquals(
            Arrays.asList("n1", "n2", "c2"),
            NotificationRevocation.tagsToCancel(revocation("n1,n2", ",c2", "new_message,new_message"))
        );
    }

    @Test
    public void aSharedConversationIsCancelledOnce() {
        assertEquals(
            Arrays.asList("n1", "n2", "c1"),
            NotificationRevocation.tagsToCancel(revocation("n1,n2", "c1,c1", "new_message,new_message"))
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
    }
}
