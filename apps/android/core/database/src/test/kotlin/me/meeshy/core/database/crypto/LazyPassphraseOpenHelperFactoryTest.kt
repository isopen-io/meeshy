package me.meeshy.core.database.crypto

import android.content.Context
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.lang.reflect.Proxy
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LazyPassphraseOpenHelperFactoryTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private val callback = object : SupportSQLiteOpenHelper.Callback(1) {
        override fun onCreate(db: SupportSQLiteDatabase) = Unit
        override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    }

    private val configuration: SupportSQLiteOpenHelper.Configuration
        get() = SupportSQLiteOpenHelper.Configuration.builder(context).name("lazy.db").callback(callback).build()

    private class Recorder {
        val calls = mutableListOf<String>()
        val factory = object : SupportSQLiteOpenHelper.Factory {
            override fun create(configuration: SupportSQLiteOpenHelper.Configuration): SupportSQLiteOpenHelper =
                Proxy.newProxyInstance(
                    SupportSQLiteOpenHelper::class.java.classLoader,
                    arrayOf(SupportSQLiteOpenHelper::class.java),
                ) { _, method, args ->
                    calls += method.name + (args?.firstOrNull()?.let { ":$it" } ?: "")
                    null
                } as SupportSQLiteOpenHelper
        }
    }

    @Test
    fun `la cle n'est lue qu'a la premiere ouverture`() {
        var reads = 0
        val recorder = Recorder()
        val factory = LazyPassphraseOpenHelperFactory({ reads++; byteArrayOf(1) }, { recorder.factory })

        val helper = factory.create(configuration)
        helper.setWriteAheadLoggingEnabled(true)
        assertThat(reads).isEqualTo(0)
        assertThat(helper.databaseName).isEqualTo("lazy.db")

        helper.writableDatabase
        helper.readableDatabase

        assertThat(reads).isEqualTo(1)
    }

    @Test
    fun `le drapeau WAL demande avant l'ouverture est rejoue sur l'aide reelle`() {
        val recorder = Recorder()
        val factory = LazyPassphraseOpenHelperFactory({ byteArrayOf(1) }, { recorder.factory })

        val helper = factory.create(configuration)
        helper.setWriteAheadLoggingEnabled(true)
        helper.writableDatabase

        assertThat(recorder.calls).containsAtLeast("setWriteAheadLoggingEnabled:true", "getWritableDatabase").inOrder()
    }

    @Test
    fun `fermer avant toute ouverture ne lit pas la cle`() {
        var reads = 0
        val factory = LazyPassphraseOpenHelperFactory({ reads++; byteArrayOf(1) }, { Recorder().factory })

        factory.create(configuration).close()

        assertThat(reads).isEqualTo(0)
    }
}
