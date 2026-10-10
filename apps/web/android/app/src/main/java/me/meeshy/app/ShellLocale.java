package me.meeshy.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import android.os.LocaleList;

/**
 * #9841 — sous Android 12 et moins, AppCompat ne pose la langue choisie dans
 * Meeshy (#9749) que sur les activites. Les services de premier plan, la
 * reception FCM et les canaux de notification la lisent ici : le plugin
 * garde le choix, et chacun resout ses textes par un contexte localise, meme
 * quand l'app a ete tuee et qu'aucune activite n'est la.
 */
final class ShellLocale {

    private static final String PREFS = "meeshy_shell_locale";
    private static final String KEY_TAG = "tag";

    private ShellLocale() {}

    static void store(Context context, String tag) {
        prefs(context).edit().putString(KEY_TAG, tag).apply();
    }

    static Context wrap(Context base) {
        String tag = AppLocaleRules.serviceLocale(Build.VERSION.SDK_INT, prefs(base).getString(KEY_TAG, ""));
        if (tag == null) return base;
        Configuration configuration = new Configuration(base.getResources().getConfiguration());
        configuration.setLocales(LocaleList.forLanguageTags(tag));
        return base.createConfigurationContext(configuration);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
