package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** La perte du moteur de rendu recharge l'application, sans boucler sur une page qui plante (#8564, #10276). */
public class RendererRecoveryTest {

    @Test
    public void theFirstLossRecovers() {
        assertTrue(RendererRecovery.shouldRecover(RendererRecovery.NEVER, 0, true));
        assertTrue(RendererRecovery.shouldRecover(RendererRecovery.NEVER, Long.MAX_VALUE, true));
    }

    @Test
    public void aSecondCrashWithinTheWindowLetsTheSystemDecide() {
        assertFalse(RendererRecovery.shouldRecover(1_000, 1_000, true));
        assertFalse(RendererRecovery.shouldRecover(1_000, 1_000 + RendererRecovery.WINDOW_MS, true));
    }

    @Test
    public void aCrashAfterTheWindowRecoversAgain() {
        assertTrue(RendererRecovery.shouldRecover(1_000, 1_000 + RendererRecovery.WINDOW_MS + 1, true));
    }

    @Test
    public void aRendererKilledByTheSystemForMemoryAlwaysRecovers() {
        assertTrue(RendererRecovery.shouldRecover(RendererRecovery.NEVER, 0, false));
        assertTrue(RendererRecovery.shouldRecover(1_000, 1_000, false));
        assertTrue(RendererRecovery.shouldRecover(1_000, 1_000 + RendererRecovery.WINDOW_MS, false));
    }
}
