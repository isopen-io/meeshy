package me.meeshy.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le selecteur de contacts de la coque (#8242) — la tuile « Contact » du
 * composeur (`src/lib/send/contact-card.ts`), miroir de
 * `CNContactPickerViewController` sur iOS.
 *
 * `ACTION_PICK` sur les NUMEROS du carnet : c'est l'application Contacts du
 * systeme qui montre le carnet, et elle ne rend a Meeshy qu'une permission de
 * lecture TEMPORAIRE sur la ligne choisie. Aucune permission `READ_CONTACTS`,
 * aucune lecture du carnet entier : seuls le nom et le numero de la fiche
 * choisie reviennent. Le web en ecrit la vCard (`serializeVCard`, partage).
 *
 * Referme sans choix, le selecteur rejette avec le code `CANCELED` : le web
 * n'ajoute rien et ne dit rien.
 */
@CapacitorPlugin(name = "MeeshyContacts")
public class MeeshyContactsPlugin extends Plugin {

    private static final String[] PROJECTION = { Phone.DISPLAY_NAME, Phone.NUMBER, Phone.TYPE, Phone.LABEL };

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, Phone.CONTENT_URI);
        try {
            startActivityForResult(call, intent, "pickResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Aucun carnet de contacts sur cet appareil", e);
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Intent data = result.getData();
        Uri picked = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || picked == null) {
            call.reject("Choix annule", "CANCELED");
            return;
        }
        try (Cursor cursor = getContext().getContentResolver().query(picked, PROJECTION, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Fiche illisible");
                return;
            }
            call.resolve(contactOf(cursor));
        } catch (SecurityException | IllegalArgumentException e) {
            call.reject("Fiche illisible", e);
        }
    }

    private static JSObject contactOf(Cursor cursor) {
        String name = cursor.getString(0);
        String number = cursor.getString(1);
        int type = cursor.isNull(2) ? -1 : cursor.getInt(2);
        String label = ContactPickRules.labelFor(type, cursor.getString(3));

        JSObject phone = new JSObject();
        phone.put("value", number == null ? "" : number);
        if (label != null) {
            phone.put("label", label);
        }
        JSArray phones = new JSArray();
        phones.put(phone);

        JSObject contact = new JSObject();
        contact.put("name", name == null ? "" : name);
        contact.put("phones", phones);
        return contact;
    }
}
