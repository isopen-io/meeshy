package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaintextMigrationPlanTest {

    private fun steps(main: DatabaseFileState, temp: Boolean = false, backup: Boolean = false) =
        PlaintextMigrationPlan.steps(MigrationFacts(main, temp, backup))

    @Test
    fun `une base en clair est exportee, verifiee, puis seulement alors remplacee`() {
        assertThat(steps(DatabaseFileState.PLAINTEXT)).containsExactly(
            MigrationStep.DISCARD_TEMP,
            MigrationStep.EXPORT,
            MigrationStep.VERIFY_TEMP,
            MigrationStep.MOVE_MAIN_TO_BACKUP,
            MigrationStep.PROMOTE_TEMP,
            MigrationStep.DELETE_BACKUP,
        ).inOrder()
    }

    @Test
    fun `la sauvegarde en clair n'est supprimee qu'apres la promotion de la copie chiffree`() {
        val plan = steps(DatabaseFileState.PLAINTEXT)

        assertThat(plan.indexOf(MigrationStep.DELETE_BACKUP)).isGreaterThan(plan.indexOf(MigrationStep.PROMOTE_TEMP))
        assertThat(plan.indexOf(MigrationStep.PROMOTE_TEMP)).isGreaterThan(plan.indexOf(MigrationStep.VERIFY_TEMP))
    }

    @Test
    fun `rien a faire sur une installation neuve ou deja chiffree`() {
        assertThat(steps(DatabaseFileState.ABSENT)).isEmpty()
        assertThat(steps(DatabaseFileState.ENCRYPTED)).isEmpty()
    }

    @Test
    fun `arret entre les deux renommages la copie chiffree verifiee est promue`() {
        assertThat(steps(DatabaseFileState.ABSENT, temp = true, backup = true)).containsExactly(
            MigrationStep.VERIFY_TEMP,
            MigrationStep.PROMOTE_TEMP,
            MigrationStep.DELETE_BACKUP,
        ).inOrder()
    }

    @Test
    fun `arret apres le deplacement sans copie la sauvegarde est restauree puis tout est rejoue`() {
        val plan = steps(DatabaseFileState.ABSENT, backup = true)

        assertThat(plan.first()).isEqualTo(MigrationStep.RESTORE_BACKUP)
        assertThat(plan).contains(MigrationStep.EXPORT)
    }

    @Test
    fun `une base deja chiffree nettoie les restes d'une migration terminee`() {
        assertThat(steps(DatabaseFileState.ENCRYPTED, temp = true, backup = true))
            .containsExactly(MigrationStep.DISCARD_TEMP, MigrationStep.DELETE_BACKUP).inOrder()
    }

    @Test
    fun `un fichier que le disque refuse de lire ne declenche aucun geste`() {
        assertThat(steps(DatabaseFileState.UNAVAILABLE, temp = true, backup = true)).isEmpty()
    }
}
