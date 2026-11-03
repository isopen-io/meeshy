package me.meeshy.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * #14654 — un media enregistre dans l'album Meeshy est-il toujours la ?
 * L'utilisateur a pu le supprimer de sa galerie (qui efface le fichier, ou le
 * deplace dans sa corbeille) : `shellGallerySaver`
 * (`src/lib/gallery/gallery-saver.ts`) le demande avant de refuser un
 * reenregistrement, comme Android natif relit son URI MediaStore. Seul un
 * chemin de l'album recoit une reponse (`GalleryPresenceRules`).
 */
@CapacitorPlugin(name = "MeeshyGallery")
public class MeeshyGalleryPlugin extends Plugin {

    @PluginMethod
    public void exists(PluginCall call) {
        String path = call.getString("path");
        File[] roots = getContext().getExternalMediaDirs();
        File root = roots == null || roots.length == 0 ? null : roots[0];
        File candidate = path == null || path.isEmpty() ? null : new File(path);
        if (!GalleryPresenceRules.insideAlbums(root, candidate)) {
            call.reject("outside-gallery");
            return;
        }
        JSObject result = new JSObject();
        result.put("exists", candidate.isFile());
        call.resolve(result);
    }
}
