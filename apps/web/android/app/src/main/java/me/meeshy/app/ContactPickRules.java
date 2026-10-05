package me.meeshy.app;

import android.provider.ContactsContract.CommonDataKinds.Phone;

/**
 * Le libellé d'un numéro choisi dans le carnet (#8242), dans les clés que la
 * carte de visite localise (`VCARD_KNOWN_LABELS`,
 * `packages/shared/types/contact-card.ts`) : un type connu devient sa clé, un
 * type personnalise garde le libelle de l'auteur, le reste n'en a pas.
 */
final class ContactPickRules {

    private ContactPickRules() {}

    static String labelFor(int type, String customLabel) {
        switch (type) {
            case Phone.TYPE_MOBILE:
                return "mobile";
            case Phone.TYPE_HOME:
                return "home";
            case Phone.TYPE_WORK:
                return "work";
            case Phone.TYPE_MAIN:
                return "main";
            case Phone.TYPE_OTHER:
                return "other";
            case Phone.TYPE_FAX_WORK:
            case Phone.TYPE_FAX_HOME:
            case Phone.TYPE_OTHER_FAX:
                return "fax";
            case Phone.TYPE_PAGER:
            case Phone.TYPE_WORK_PAGER:
                return "pager";
            case Phone.TYPE_CUSTOM:
                return customLabel == null || customLabel.trim().isEmpty() ? null : customLabel.trim();
            default:
                return null;
        }
    }
}
