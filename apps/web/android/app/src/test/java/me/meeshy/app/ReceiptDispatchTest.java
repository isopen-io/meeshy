package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;

/** L'accuse de remise ne retarde jamais la banniere du push suivant, comme `accuserRemise` dans `sw-push.js` (#12623). */
public class ReceiptDispatchTest {

    private static Executor threads() {
        return task -> {
            Thread thread = new Thread(task);
            thread.setDaemon(true);
            thread.start();
        };
    }

    @Test
    public void aQuickReceiptIsAwaitedSoItFinishesWhileFcmHoldsTheService() {
        AtomicBoolean sent = new AtomicBoolean(false);
        assertTrue(ReceiptDispatch.run(threads(), () -> sent.set(true), 2_000));
        assertTrue(sent.get());
    }

    @Test
    public void aSlowReceiptNoLongerHoldsTheNextPushBeyondTheBound() throws InterruptedException {
        CountDownLatch network = new CountDownLatch(1);
        CountDownLatch sent = new CountDownLatch(1);
        long started = System.nanoTime();
        boolean finished = ReceiptDispatch.run(threads(), () -> {
            try {
                network.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            sent.countDown();
        }, 200);
        long waitedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        assertFalse(finished);
        assertTrue("attendu " + waitedMs + " ms", waitedMs < 1_500);
        network.countDown();
        assertTrue("l'accuse lent continue en arriere-plan", sent.await(2, TimeUnit.SECONDS));
    }

    @Test
    public void aRefusedReceiptDoesNotThrow() {
        Executor refusing = task -> {
            throw new RejectedExecutionException("plein");
        };
        assertFalse(ReceiptDispatch.run(refusing, () -> {}, 2_000));
    }
}
