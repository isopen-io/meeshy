package me.meeshy.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Un test Robolectric qui ne choisit pas son application ne démarre pas `MeeshyApplication` (#16331).
 *
 * Sinon chaque test monte le graphe Hilt de production : les crochets de lancement planifient le travail
 * périodique de WorkManager (widgets, rétention, entretien de la base), dont le suivi des contraintes
 * « batterie suffisante » tourne sur l'exécuteur de WorkManager APRÈS la fin du test, et lève dans le test
 * suivant de la même JVM un `UncaughtExceptionsBeforeTest` qui ne le concerne pas.
 */
@RunWith(RobolectricTestRunner::class)
class RobolectricSandboxApplicationTest {

    @Test
    fun `un test sans application declaree tourne sur une application nue, sans le graphe de production`() {
        val application = ApplicationProvider.getApplicationContext<Application>()

        assertThat(application).isNotInstanceOf(MeeshyApplication::class.java)
        assertThat(application.javaClass).isEqualTo(Application::class.java)
    }
}
