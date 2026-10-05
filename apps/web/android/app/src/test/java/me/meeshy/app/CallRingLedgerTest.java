package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Un appel refusé, décroché ou arrêté ne sonne plus, même si FCM rejoue sa poussée (#8049). */
public class CallRingLedgerTest {

    @Test
    public void aRecordedCallIsSilencedWithinTheWindow() {
        CallRingLedger ledger = CallRingLedger.empty().with("c1", 0);
        assertTrue(ledger.silenced("c1", CallRingLedger.TTL_MS));
        assertFalse(ledger.silenced("c2", 0));
    }

    @Test
    public void theSilenceExpiresAfterTheWindow() {
        assertFalse(CallRingLedger.empty().with("c1", 0).silenced("c1", CallRingLedger.TTL_MS + 1));
    }

    @Test
    public void theLedgerIsImmutable() {
        CallRingLedger empty = CallRingLedger.empty();
        empty.with("c1", 0);
        assertFalse(empty.silenced("c1", 0));
    }

    @Test
    public void itRoundTripsThroughItsEncoding() {
        CallRingLedger ledger = CallRingLedger.empty().with("c1", 10).with("c2", 20);
        CallRingLedger decoded = CallRingLedger.decode(ledger.encode());
        assertTrue(decoded.silenced("c1", 10));
        assertTrue(decoded.silenced("c2", 20));
        assertEquals(ledger.encode(), decoded.encode());
    }

    @Test
    public void anUnreadableEncodingIsAnEmptyLedger() {
        assertEquals("", CallRingLedger.decode(null).encode());
        assertEquals("", CallRingLedger.decode("garbage,:1,c:x").encode());
    }

    @Test
    public void itKeepsOnlyTheMostRecentCalls() {
        CallRingLedger ledger = CallRingLedger.empty();
        for (int i = 0; i < CallRingLedger.CAPACITY + 5; i++) ledger = ledger.with("c" + i, i);
        assertFalse(ledger.silenced("c0", 100));
        assertTrue(ledger.silenced("c" + (CallRingLedger.CAPACITY + 4), 100));
    }

    @Test
    public void expiredEntriesAreDroppedOnWrite() {
        CallRingLedger ledger = CallRingLedger.empty().with("old", 0).with("new", CallRingLedger.TTL_MS + 10);
        assertEquals("new:" + (CallRingLedger.TTL_MS + 10), ledger.encode());
    }
}
