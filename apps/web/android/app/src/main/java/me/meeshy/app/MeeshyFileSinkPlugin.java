package me.meeshy.app;

import android.util.Base64;
import android.webkit.MimeTypeMap;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * #9514 — une video plus lourde que le pont (32 Mo, `NATIVE_BRIDGE_MAX_BYTES`)
 * arrive ici par tranches base64, ecrites dans un fichier du cache de l'app,
 * puis `saveVideo` du plugin `Media` copie ce fichier dans l'album Meeshy
 * (`shellGallerySaver`, `src/lib/gallery/gallery-saver.ts`). Aucune tranche ne
 * depasse quelques Mo dans le pont, comme le telechargement de Chrome ecrit
 * sans tout tenir en memoire.
 *
 * Le fichier ne se nomme jamais depuis la page : son nom est un UUID tire ici,
 * son extension vient du type du media, et `discard` l'efface. Ce qu'un arret
 * brutal laisse derriere lui est efface au prochain demarrage.
 */
@CapacitorPlugin(name = "MeeshyFileSink")
public class MeeshyFileSinkPlugin extends Plugin {

    static final String DIRECTORY = "file-sink";

    private final Map<String, File> files = new ConcurrentHashMap<>();

    @Override
    public void load() {
        File[] leftovers = directory().listFiles();
        if (leftovers == null) return;
        for (File leftover : leftovers) {
            if (!leftover.delete()) leftover.deleteOnExit();
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        String mimeType = call.getString("mimeType");
        String extension = mimeType == null ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (!FileSinkRules.extensionAllowed(extension)) {
            call.reject("unsupported-type");
            return;
        }
        File directory = directory();
        String id = UUID.randomUUID().toString();
        File file = new File(directory, id + "." + extension);
        try {
            if ((!directory.isDirectory() && !directory.mkdirs()) || !file.createNewFile()) {
                call.reject("sink-unavailable");
                return;
            }
        } catch (IOException error) {
            call.reject("sink-unavailable", error);
            return;
        }
        files.put(id, file);
        JSObject result = new JSObject();
        result.put("id", id);
        call.resolve(result);
    }

    @PluginMethod
    public void append(PluginCall call) {
        File file = fileOf(call);
        String data = call.getString("data");
        if (file == null || data == null) {
            call.reject("unknown-sink");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("invalid-chunk", error);
            return;
        }
        if (!FileSinkRules.fits(file.length(), bytes.length)) {
            call.reject("too-large");
            return;
        }
        try (FileOutputStream out = new FileOutputStream(file, true)) {
            out.write(bytes);
        } catch (IOException error) {
            call.reject("write-failed", error);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        File file = fileOf(call);
        if (file == null) {
            call.reject("unknown-sink");
            return;
        }
        JSObject result = new JSObject();
        result.put("path", file.getAbsolutePath());
        call.resolve(result);
    }

    @PluginMethod
    public void discard(PluginCall call) {
        String id = call.getString("id");
        File file = id == null ? null : files.remove(id);
        if (file != null && !file.delete()) file.deleteOnExit();
        call.resolve();
    }

    private File fileOf(PluginCall call) {
        String id = call.getString("id");
        return id == null ? null : files.get(id);
    }

    private File directory() {
        return new File(getContext().getCacheDir(), DIRECTORY);
    }
}
