package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/** La coque sonne un appel entrant data-only et remet tout le reste au plugin (#8049). */
public class CallPushTest {

    private static final long NOW = 1_000_000L;

    private static Map<String, String> ring(String... overrides) {
        Map<String, String> data = new HashMap<>();
        data.put("type", "call");
        data.put("callId", "c1");
        data.put("conversationId", "conv1");
        data.put("callerName", "Alice");
        data.put("isVideo", "false");
        data.put("title", "Alice vous appelle");
        data.put("body", "Appel vocal");
        data.put("answerLabel", "Répondre");
        data.put("declineLabel", "Refuser");
        for (int i = 0; i + 1 < overrides.length; i += 2) data.put(overrides[i], overrides[i + 1]);
        return data;
    }

    private static CallPush route(Map<String, String> data) {
        return CallPush.route(data, false, CallRingLedger.empty(), NOW);
    }

    @Test
    public void aCallPushRingsWithTheServerLocalisedTexts() {
        CallPush push = route(ring());
        assertEquals(CallPush.Kind.RING, push.kind);
        assertEquals("c1", push.callId);
        assertEquals("conv1", push.conversationId);
        assertEquals("Alice vous appelle", push.title);
        assertEquals("Appel vocal", push.body);
        assertEquals("Répondre", push.answerLabel);
        assertEquals("Refuser", push.declineLabel);
        assertFalse(push.video);
    }

    @Test
    public void aVideoCallIsFlaggedVideo() {
        assertTrue(route(ring("isVideo", "true")).video);
    }

    @Test
    public void aMissingTitleFallsBackToTheCallerName() {
        assertEquals("Alice", route(ring("title", "")).title);
    }

    @Test
    public void aMessagePushIsNotACallAndGoesToThePlugin() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "new_message");
        data.put("conversationId", "conv1");
        assertEquals(CallPush.Kind.NOT_CALL, route(data).kind);
    }

    @Test
    public void aPushWithoutTypeIsNotACall() {
        assertEquals(CallPush.Kind.NOT_CALL, route(new HashMap<>()).kind);
    }

    @Test
    public void cancelAndAnsweredElsewhereStopTheRing() {
        Map<String, String> cancel = new HashMap<>();
        cancel.put("type", "call_cancel");
        cancel.put("callId", "c1");
        CallPush stop = route(cancel);
        assertEquals(CallPush.Kind.STOP, stop.kind);
        assertEquals("c1", stop.callId);

        cancel.put("type", "call_answered_elsewhere");
        assertEquals(CallPush.Kind.STOP, route(cancel).kind);
    }

    @Test
    public void aStopWithoutCallIdIsSuppressed() {
        Map<String, String> cancel = new HashMap<>();
        cancel.put("type", "call_cancel");
        assertEquals(CallPush.Kind.SUPPRESS, route(cancel).kind);
    }

    @Test
    public void aMalformedCallNeverRingsNorReachesThePlugin() {
        assertEquals(CallPush.Kind.SUPPRESS, route(ring("callId", " ")).kind);
        assertEquals(CallPush.Kind.SUPPRESS, route(ring("conversationId", "")).kind);
    }

    @Test
    public void theAppInForegroundDoesNotRingTwice() {
        assertEquals(CallPush.Kind.SUPPRESS, CallPush.route(ring(), true, CallRingLedger.empty(), NOW).kind);
    }

    @Test
    public void aSilencedCallDoesNotRingAgain() {
        CallRingLedger ledger = CallRingLedger.empty().with("c1", NOW - 1_000);
        assertEquals(CallPush.Kind.SUPPRESS, CallPush.route(ring(), false, ledger, NOW).kind);
    }

    @Test
    public void aCancelThatArrivedFirstSilencesTheLateRing() {
        CallRingLedger ledger = CallRingLedger.empty().with("c1", NOW);
        assertEquals(CallPush.Kind.SUPPRESS, CallPush.route(ring(), false, ledger, NOW + 5_000).kind);
    }

    @Test
    public void theNotificationIdIsStablePerCall() {
        assertEquals(CallPush.notificationId("c1"), CallPush.notificationId("c1"));
        assertFalse(CallPush.notificationId("c1") == CallPush.notificationId("c2"));
    }

    @Test
    public void absentBodyStaysAbsentForTheNativeFallback() {
        assertNull(route(ring("body", "")).body);
    }
}
