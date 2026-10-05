package me.meeshy.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;

/**
 * « Coller » une image en sticker dans la coque (#8640). La WebView ne sert
 * pas `navigator.clipboard.read()` — aucune permission `clipboard-read` n'y
 * est accordee — et la feuille des stickers
 * (`src/components/composer-sticker-sheet.tsx`) disait « Aucune image » avec
 * une image copiee. La coque lit donc le presse-papier systeme : le premier
 * element dont l'URI est une image, rendu en base64 (`mimeType`, `data`).
 * Rien d'image, trop lourd ou illisible : un objet vide, et le web dit
 * « rien a coller ».
 */
@CapacitorPlugin(name = "MeeshyClipboard")
public class MeeshyClipboardPlugin extends Plugin {

    @PluginMethod
    public void readImage(PluginCall call) {
        ClipboardManager manager = getContext().getSystemService(ClipboardManager.class);
        ClipData clip = manager == null ? null : manager.getPrimaryClip();
        JSObject result = new JSObject();
        if (clip == null) {
            call.resolve(result);
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        for (int i = 0; i < clip.getItemCount(); i++) {
            Uri uri = clip.getItemAt(i).getUri();
            String mimeType = uri == null ? null : resolver.getType(uri);
            if (!ClipboardImage.isImage(mimeType)) continue;
            try (InputStream input = resolver.openInputStream(uri)) {
                byte[] image = input == null ? null : ClipboardImage.readCapped(input, ClipboardImage.MAX_BYTES);
                if (image != null) {
                    result.put("mimeType", mimeType);
                    result.put("data", Base64.encodeToString(image, Base64.NO_WRAP));
                }
            } catch (Exception error) {
                // Une URI revoquee ou illisible : rien a coller.
            }
            break;
        }
        call.resolve(result);
    }
}
