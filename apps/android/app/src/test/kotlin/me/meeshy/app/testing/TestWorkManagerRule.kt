package me.meeshy.app.testing

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import org.junit.rules.ExternalResource

/**
 * Le WorkManager d'un test Robolectric : exécuteur synchrone et ordonnanceur de test (#16331).
 *
 * L'application des tests est nue (`robolectric.properties`) : rien n'y initialise WorkManager. Un sujet qui planifie
 * du travail l'obtient ici, sans ordonnanceur réel ni suivi de contraintes qui survivrait au test.
 */
class TestWorkManagerRule : ExternalResource() {

    override fun before() {
        WorkManagerTestInitHelper.initializeTestWorkManager(ApplicationProvider.getApplicationContext<Context>())
    }
}
