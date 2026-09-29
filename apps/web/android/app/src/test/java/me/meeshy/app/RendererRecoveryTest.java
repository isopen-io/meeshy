package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** La perte du moteur de rendu recharge l'application, sans boucler sur une page qui plante (#8564). */
public class RendererRecoveryTest {

    @Test
    public void theFirstLossRecovers() {
        assertTrue(RendererRecovery.shouldRecover(RendererRecovery.NEVER, 0));
        assertTrue(RendererRecovery.shouldRecover(RendererRecovery.NEVER, Long.MAX_VALUE));
    }

    @Test
    public void aSecondLossWithinTheWindowLetsTheSystemDecide() {
        assertFalse(RendererRecovery.shouldRecover(1_000, 1_000));
        assertFalse(RendererRecovery.shouldRecover(1_000, 1_000 + RendererRecovery.WINDOW_MS));
    }

    @Test
    public void aLossAfterTheWindowRecoversAgain() {
        assertTrue(RendererRecovery.shouldRecover(1_000, 1_000 + RendererRecovery.WINDOW_MS + 1));
    }
}
