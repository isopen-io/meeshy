package me.meeshy.app.onboarding

import android.content.Context
import android.provider.ContactsContract
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.contacts.ContactMatchEntry

/** Lit le carnet de l'appareil en fiches rapprochables (nom, numéros, e-mails). Un PORT : les témoins le remplacent. */
interface DeviceContactsReading {
    suspend fun read(): List<ContactMatchEntry>
}

/**
 * Deux requêtes en masse (téléphones, e-mails), jamais une par contact : un carnet de milliers de fiches se lit en
 * quelques dizaines de millisecondes, hors du fil principal. Exige `READ_CONTACTS`, que l'écran a obtenue AVANT.
 */
@Singleton
class DeviceContactsReader @Inject constructor(
    @ApplicationContext private val context: Context,
    @IoDispatcher private val io: CoroutineDispatcher,
) : DeviceContactsReading {

    override suspend fun read(): List<ContactMatchEntry> = withContext(io) {
        val names = LinkedHashMap<Long, String?>()
        val phones = HashMap<Long, MutableList<String>>()
        val emails = HashMap<Long, MutableList<String>>()
        collect(
            ContactsContract.Contacts.CONTENT_URI,
            arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY),
        ) { cursor -> names[cursor.getLong(0)] = cursor.getString(1) }
        collect(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.NUMBER),
        ) { cursor -> cursor.getString(1)?.let { phones.getOrPut(cursor.getLong(0)) { mutableListOf() } += it } }
        collect(
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Email.CONTACT_ID, ContactsContract.CommonDataKinds.Email.ADDRESS),
        ) { cursor -> cursor.getString(1)?.let { emails.getOrPut(cursor.getLong(0)) { mutableListOf() } += it } }
        names.map { (id, name) ->
            ContactMatchEntry(
                displayName = name,
                phoneNumbers = phones[id].orEmpty().distinct(),
                emails = emails[id].orEmpty().distinct(),
            )
        }.filter { it.isMatchable }
    }

    private inline fun collect(uri: android.net.Uri, projection: Array<String>, row: (android.database.Cursor) -> Unit) {
        context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) row(cursor)
        }
    }
}
