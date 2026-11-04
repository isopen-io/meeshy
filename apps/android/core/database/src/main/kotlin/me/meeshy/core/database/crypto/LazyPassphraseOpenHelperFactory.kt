package me.meeshy.core.database.crypto

import androidx.sqlite.db.SupportSQLiteOpenHelper
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.lang.reflect.Proxy

/**
 * Remet à Room une aide d'ouverture dont la phrase secrète n'est lue qu'au premier accès à la base
 * (`writableDatabase` / `readableDatabase`), sur le thread qui ouvre. En production, `DatabaseOpener` a déjà exécuté
 * la préparation (clé, migration) et ouvert la base dans le `@Provides` : la paresse ne déplace donc rien hors du
 * thread qui construit le singleton, elle garantit seulement qu'aucune aide n'est créée sans phrase prête.
 * [delegateFor] fabrique la vraie fabrique (SQLCipher) pour la phrase lue. Le drapeau WAL demandé avant l'ouverture est
 * rejoué sur l'aide réelle. Un proxy évite de recopier la surface de `SupportSQLiteOpenHelper`, qui change de langue
 * d'une version d'androidx.sqlite à l'autre.
 */
public class LazyPassphraseOpenHelperFactory(
    private val passphrase: () -> ByteArray,
    private val delegateFor: (ByteArray) -> SupportSQLiteOpenHelper.Factory,
) : SupportSQLiteOpenHelper.Factory {

    override fun create(configuration: SupportSQLiteOpenHelper.Configuration): SupportSQLiteOpenHelper {
        val handler = LazyHandler(configuration)
        return Proxy.newProxyInstance(
            SupportSQLiteOpenHelper::class.java.classLoader,
            arrayOf(SupportSQLiteOpenHelper::class.java),
            handler,
        ) as SupportSQLiteOpenHelper
    }

    private inner class LazyHandler(private val configuration: SupportSQLiteOpenHelper.Configuration) :
        java.lang.reflect.InvocationHandler {
        private var delegate: SupportSQLiteOpenHelper? = null
        private var walRequested: Boolean? = null

        @Synchronized
        override fun invoke(proxy: Any, method: Method, args: Array<out Any?>?): Any? {
            val arguments = args ?: emptyArray()
            when (method.name) {
                "getDatabaseName" -> return configuration.name
                "setWriteAheadLoggingEnabled" -> {
                    val enabled = arguments[0] as Boolean
                    walRequested = enabled
                    delegate?.setWriteAheadLoggingEnabled(enabled)
                    return null
                }
                "close" -> {
                    delegate?.close()
                    return null
                }
                "hashCode" -> return System.identityHashCode(proxy)
                "equals" -> return proxy === arguments[0]
                "toString" -> return "LazyPassphraseOpenHelper(${configuration.name})"
            }
            val real = delegate ?: open()
            return try {
                method.invoke(real, *arguments)
            } catch (failure: InvocationTargetException) {
                throw failure.targetException
            }
        }

        private fun open(): SupportSQLiteOpenHelper {
            val phrase = passphrase()
            val helper = delegateFor(phrase).create(configuration)
            walRequested?.let(helper::setWriteAheadLoggingEnabled)
            delegate = helper
            return helper
        }
    }
}
