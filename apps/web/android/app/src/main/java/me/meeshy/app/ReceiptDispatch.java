package me.meeshy.app;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

/**
 * #12623 — l'accuse de remise d'un push part HORS du fil que FCM consacre aux
 * pushs, jumeau de `accuserRemise` que `sw-push.js` lance en parallele de la
 * banniere. FCM traite les pushs un par un : un accuse bloquant (8 s de
 * connexion, 8 s de lecture) alignait la banniere de chaque message suivant
 * derriere un reseau lent. Le push attend son accuse au plus {@link #WAIT_MS}
 * — le temps d'un reseau ordinaire, pendant que FCM tient encore le service —
 * puis rend la main ; un accuse plus lent continue en arriere-plan, au mieux,
 * comme avant.
 */
final class ReceiptDispatch {

    static final long WAIT_MS = 2_000;

    private static final ExecutorService POSTS = Executors.newCachedThreadPool(task -> {
        Thread thread = new Thread(task, "MeeshyReceipt");
        thread.setDaemon(true);
        return thread;
    });

    private ReceiptDispatch() {}

    static boolean run(Runnable post) {
        return run(POSTS, post, WAIT_MS);
    }

    /** Vrai quand l'accuse a fini dans le temps imparti. */
    static boolean run(Executor executor, Runnable post, long waitMs) {
        CountDownLatch done = new CountDownLatch(1);
        try {
            executor.execute(() -> {
                try {
                    post.run();
                } finally {
                    done.countDown();
                }
            });
        } catch (RejectedExecutionException refused) {
            return false;
        }
        try {
            return done.await(waitMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
