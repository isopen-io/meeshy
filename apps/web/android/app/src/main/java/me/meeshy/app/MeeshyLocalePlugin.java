package me.meeshy.app;

import android.os.Handler;
import android.os.Looper;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * #9749 — la langue choisie dans Meeshy devient celle de l'application, que
 * « Langue de l'app » d'Android affiche (#9748) : les textes que la coque
 * ecrit elle-meme (appel en cours, lecture, enregistrement, canaux) la
 * suivent, comme sur le web ou tout est ecrit par la page
 * (`src/lib/shell-locale.ts`). L'activite declare `locale|layoutDirection`
 * dans `configChanges` : la poser ne la recree pas.
 */
@CapacitorPlugin(name = "MeeshyLocale")
public class MeeshyLocalePlugin extends Plugin {

    @PluginMethod
    public void setLocales(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            String target = AppLocaleRules.target(
                AppCompatDelegate.getApplicationLocales().toLanguageTags(),
                call.getString("tag"),
                Boolean.TRUE.equals(call.getBoolean("ifUnset", false))
            );
            if (target != null) AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(target));
            call.resolve();
        });
    }
}
