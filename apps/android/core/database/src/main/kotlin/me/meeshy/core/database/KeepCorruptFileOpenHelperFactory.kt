package me.meeshy.core.database

import android.database.sqlite.SQLiteException
import android.util.Log
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import java.io.File

/**
 * Le fichier d'une base corrompue n'est JAMAIS supprimé par la couche SQLite : c'est [DatabaseOpener] qui en sauve
 * l'outbox, les clairs E2EE à effacer et les identifiants en attente, puis le met en quarantaine.
 *
 * Deux chemins du framework le supprimaient avant que le sauvetage ne le lise :
 * - `SupportSQLiteOpenHelper.Callback.onCorruption`, par défaut, efface la base et ses fichiers compagnons dès que SQLite
 *   signale `SQLITE_CORRUPT` (une page abîmée que Room lit à l'ouverture, ou plus tard en cours d'usage) ;
 * - le helper du framework, quand `onOpen` lève une `SQLiteException` (la vérification d'identité de Room lit
 *   `room_master_table`), réessaie puis supprime la base pour la recréer vide.
 * [KeepFileOnCorruption] neutralise le premier et emballe l'échec de `onOpen` pour que le second ne s'applique pas ;
 * la cause reste dans la chaîne, et [DatabaseRecovery.classify] la lit.
 *
 * Garder le fichier ne suffit pas quand la corruption est découverte EN COURS D'USAGE : au lancement suivant, la base
 * s'ouvrirait normalement et la même page échouerait de nouveau. `onCorruption` pose donc un marqueur durable
 * ([DatabaseRecovery.markCorrupted]) que [DatabaseOpener] traite au lancement suivant comme une base illisible.
 */
public class KeepCorruptFileOpenHelperFactory(
    private val delegate: SupportSQLiteOpenHelper.Factory = FrameworkSQLiteOpenHelperFactory(),
) : SupportSQLiteOpenHelper.Factory {

    override fun create(configuration: SupportSQLiteOpenHelper.Configuration): SupportSQLiteOpenHelper =
        delegate.create(
            SupportSQLiteOpenHelper.Configuration.builder(configuration.context)
                .name(configuration.name)
                .callback(KeepFileOnCorruption(configuration.callback))
                .noBackupDirectory(configuration.useNoBackupDirectory)
                .allowDataLossOnRecovery(configuration.allowDataLossOnRecovery)
                .build(),
        )
}

/** L'échec d'ouverture d'une base, emballé hors de `SQLiteException` pour que le framework ne supprime pas le fichier. */
public class DatabaseOpenCallbackException(cause: SQLiteException) : IllegalStateException(cause.message, cause)

internal class KeepFileOnCorruption(
    private val delegate: SupportSQLiteOpenHelper.Callback,
) : SupportSQLiteOpenHelper.Callback(delegate.version) {

    override fun onConfigure(db: SupportSQLiteDatabase) {
        delegate.onConfigure(db)
    }

    override fun onCreate(db: SupportSQLiteDatabase) {
        delegate.onCreate(db)
    }

    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {
        delegate.onUpgrade(db, oldVersion, newVersion)
    }

    override fun onDowngrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {
        delegate.onDowngrade(db, oldVersion, newVersion)
    }

    override fun onOpen(db: SupportSQLiteDatabase) {
        try {
            delegate.onOpen(db)
        } catch (failure: SQLiteException) {
            throw DatabaseOpenCallbackException(failure)
        }
    }

    override fun onCorruption(db: SupportSQLiteDatabase) {
        val path = db.path?.takeUnless { it.isBlank() || it == DatabaseRecovery.IN_MEMORY_PATH } ?: return
        val marked = DatabaseRecovery.markCorrupted(File(path))
        Log.e(TAG, "Corruption signalee par SQLite : fichier garde, reparation au prochain lancement (marqueur=$marked)")
    }

    private companion object {
        const val TAG = "MeeshyDatabase"
    }
}
