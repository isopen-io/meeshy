package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/** L'accuse de remise d'un push recu par la coque, jumeau de `sw-push.js` § accuserRemise (#8124). */
public class PushDeliveryReceiptTest {

    private static Map<String, String> push(String type, String conversationId, String messageId) {
        Map<String, String> data = new HashMap<>();
        if (type != null) data.put("type", type);
        if (conversationId != null) data.put("conversationId", conversationId);
        if (messageId != null) data.put("messageId", messageId);
        return data;
    }

    @Test
    public void aNewMessageIsAcknowledgedAsDeliveredOnItsConversation() {
        PushDeliveryReceipt receipt = PushDeliveryReceipt.of(push("new_message", "c1", "m1"), "https://gate.meeshy.me/");
        assertNotNull(receipt);
        assertEquals("https://gate.meeshy.me/api/v1/conversations/c1/receipts", receipt.url);
        assertEquals("{\"type\":\"delivered\",\"messageIds\":[\"m1\"]}", receipt.body);
    }

    @Test
    public void everyMessageArrivalTypeOfTheWebWorkerIsAcknowledged() {
        String[] types = {
            "new_message", "message_reply", "reply", "message_forwarded", "user_mentioned",
            "new_conversation", "new_conversation_direct", "new_conversation_group",
            "added_to_conversation",
        };
        for (String type : types) {
            assertNotNull(type, PushDeliveryReceipt.of(push(type, "c1", "m1"), "https://gate.meeshy.me"));
        }
    }

    @Test
    public void aReactionCarriesTheReactedMessageButIsNotADelivery() {
        assertNull(PushDeliveryReceipt.of(push("message_reaction", "c1", "m1"), "https://gate.meeshy.me"));
        assertNull(PushDeliveryReceipt.of(push("post_like", "c1", "m1"), "https://gate.meeshy.me"));
        assertNull(PushDeliveryReceipt.of(push(null, "c1", "m1"), "https://gate.meeshy.me"));
    }

    @Test
    public void nothingIsAcknowledgedWithoutConversationOrMessage() {
        assertNull(PushDeliveryReceipt.of(push("new_message", " ", "m1"), "https://gate.meeshy.me"));
        assertNull(PushDeliveryReceipt.of(push("new_message", "c1", null), "https://gate.meeshy.me"));
    }

    @Test
    public void nothingIsAcknowledgedWithoutAnAbsoluteApiBase() {
        assertNull(PushDeliveryReceipt.of(push("new_message", "c1", "m1"), null));
        assertNull(PushDeliveryReceipt.of(push("new_message", "c1", "m1"), "/api"));
    }

    @Test
    public void idsAreEncodedInTheUrlAndEscapedInTheBody() {
        PushDeliveryReceipt receipt = PushDeliveryReceipt.of(push(" new_message ", "a/b c", "m\"1"), "https://gate.meeshy.me");
        assertNotNull(receipt);
        assertEquals("https://gate.meeshy.me/api/v1/conversations/a%2Fb%20c/receipts", receipt.url);
        assertEquals("{\"type\":\"delivered\",\"messageIds\":[\"m\\\"1\"]}", receipt.body);
    }
}
