package me.meeshy.app;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * #9749 — la langue que la page demande pour l'application. Seules les sept
 * langues de l'interface passent (`SUPPORTED_INTERFACE_LANGUAGES`, les memes
 * que `res/xml/locales_config.xml`) ; le tag vide rend la main au systeme.
 * Au demarrage (`ifUnset`), le choix ne remplit qu'un reglage vide : une
 * langue posee depuis « Langue de l'app » d'Android n'est jamais ecrasee.
 */
final class AppLocaleRules {

    static final List<String> SUPPORTED = Arrays.asList("fr", "en", "es", "pt", "de", "it", "ar");

    private AppLocaleRules() {}

    /** Le tag a poser, ou {@code null} quand rien ne doit changer. */
    static String target(String current, String requested, boolean ifUnset) {
        String now = current == null ? "" : current;
        String wanted = requested == null ? "" : requested.trim().toLowerCase(Locale.ROOT);
        if (!wanted.isEmpty() && !SUPPORTED.contains(wanted)) return null;
        if (ifUnset && !now.isEmpty()) return null;
        return wanted.equals(now) ? null : wanted;
    }
}
