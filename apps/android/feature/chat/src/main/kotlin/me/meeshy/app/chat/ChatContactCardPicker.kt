package me.meeshy.app.chat

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract.CommonDataKinds.Email
import android.provider.ContactsContract.CommonDataKinds.Event
import android.provider.ContactsContract.CommonDataKinds.Organization
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.CommonDataKinds.StructuredName
import android.provider.ContactsContract.CommonDataKinds.StructuredPostal
import android.provider.ContactsContract.CommonDataKinds.Website
import android.provider.ContactsContract.Contacts
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.contacts.vcard.AddressBookContact
import me.meeshy.sdk.model.contacts.vcard.AddressBookPostal
import me.meeshy.sdk.model.contacts.vcard.AddressBookValue
import me.meeshy.sdk.model.contacts.vcard.ContactCardExporter

/**
 * La tuile « Contact » du composeur (#13703, iOS `composerState.showContactPicker` + `ContactCardExporter`) :
 * le sélecteur du système choisit UNE fiche, sans autorisation d'accès au carnet ; ses champs se lisent
 * ensuite, `READ_CONTACTS` n'étant demandée qu'à ce moment et seulement si l'app ne l'a pas déjà. La carte
 * écrite par [ContactCardExporter] rejoint le plateau par [onCard], le chemin de toute pièce choisie.
 * Une fiche illisible (refus, fiche vide) le dit par un toast et n'envoie rien.
 */
@Composable
internal fun rememberContactCardPicker(onCard: (file: File, fileName: String, mimeType: String) -> Unit): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var awaitingPermission by rememberSaveable { mutableStateOf<Uri?>(null) }
    val deliver: (Uri) -> Unit = { uri ->
        scope.launch {
            val written = withContext(Dispatchers.IO) { runCatching { writeContactCard(context, uri) }.getOrNull() }
            if (written == null) {
                Toast.makeText(context, R.string.viewer_contact_unreadable, Toast.LENGTH_SHORT).show()
            } else {
                onCard(written.first, written.second, ContactCardExporter.MIME_TYPE)
            }
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        awaitingPermission?.let(deliver)
        awaitingPermission = null
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickContact()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            deliver(uri)
        } else {
            awaitingPermission = uri
            permission.launch(Manifest.permission.READ_CONTACTS)
        }
    }
    return { picker.launch(null) }
}

private fun writeContactCard(context: Context, contactUri: Uri): Pair<File, String>? {
    val export = AddressBookContactReader.read(context, contactUri)?.let(ContactCardExporter::export) ?: return null
    val file = File(context.cacheDir, "contact-card-${UUID.randomUUID()}.vcf")
    file.writeBytes(export.bytes)
    return file to export.fileName
}

/** Lit les lignes de LA fiche choisie (sous-répertoire `entities` de son URI), rien d'autre du carnet. */
private object AddressBookContactReader {

    fun read(context: Context, contactUri: Uri): AddressBookContact? {
        val resolver = context.contentResolver
        val displayName = resolver.query(contactUri, arrayOf(Contacts.DISPLAY_NAME_PRIMARY), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
        val entities = Uri.withAppendedPath(contactUri, Contacts.Entity.CONTENT_DIRECTORY)
        var contact = AddressBookContact(displayName = displayName)
        resolver.query(entities, null, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) contact = contact.merging(cursor)
        } ?: return null
        return contact
    }

    private fun AddressBookContact.merging(row: Cursor): AddressBookContact = when (row.text(Contacts.Entity.MIMETYPE)) {
        StructuredName.CONTENT_ITEM_TYPE ->
            if (!givenName.isNullOrBlank() || !familyName.isNullOrBlank()) this
            else copy(givenName = row.text(StructuredName.GIVEN_NAME), familyName = row.text(StructuredName.FAMILY_NAME))
        Phone.CONTENT_ITEM_TYPE -> row.text(Phone.NUMBER)?.let { copy(phones = phones + AddressBookValue(it, row.int(Phone.TYPE))) } ?: this
        Email.CONTENT_ITEM_TYPE -> row.text(Email.ADDRESS)?.let { copy(emails = emails + AddressBookValue(it, row.int(Email.TYPE))) } ?: this
        StructuredPostal.CONTENT_ITEM_TYPE -> copy(
            addresses = addresses + AddressBookPostal(
                street = row.text(StructuredPostal.STREET).orEmpty(),
                city = row.text(StructuredPostal.CITY).orEmpty(),
                region = row.text(StructuredPostal.REGION).orEmpty(),
                postalCode = row.text(StructuredPostal.POSTCODE).orEmpty(),
                country = row.text(StructuredPostal.COUNTRY).orEmpty(),
                type = row.int(StructuredPostal.TYPE),
            ),
        )
        Organization.CONTENT_ITEM_TYPE ->
            if (!organization.isNullOrBlank() || !jobTitle.isNullOrBlank()) this
            else copy(organization = row.text(Organization.COMPANY), jobTitle = row.text(Organization.TITLE))
        Website.CONTENT_ITEM_TYPE -> row.text(Website.URL)?.let { copy(websites = websites + it) } ?: this
        Event.CONTENT_ITEM_TYPE ->
            if (birthday == null && row.int(Event.TYPE) == Event.TYPE_BIRTHDAY) copy(birthday = row.text(Event.START_DATE)) else this
        else -> this
    }

    private fun Cursor.text(column: String): String? = getColumnIndex(column).takeIf { it >= 0 }?.let { getString(it) }

    private fun Cursor.int(column: String): Int =
        getColumnIndex(column).takeIf { it >= 0 && !isNull(it) }?.let { getInt(it) } ?: 0
}
