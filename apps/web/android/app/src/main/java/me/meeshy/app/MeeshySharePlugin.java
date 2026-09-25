package me.meeshy.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Le pont de partage de la coque (#7710). La WebView Android n'implemente pas
 * l'API Web Share : `navigator.share` y est absent (crbug 765923), et
 * `portailDuNavigateur()` (`src/lib/view/invitation.ts`) ne voyait qu'un
 * presse-papier — chaque « Partager » copiait le lien la ou le web mobile et
 * iOS ouvrent la feuille du systeme.
 *
 * Le cote web appelle `Capacitor.nativePromise('MeeshyShare', 'share', ...)`
 * quand `navigator.share` manque. La feuille est lancee POUR RESULTAT (#7822) :
 * fermee sans choix, elle revient annulee alors que l'activite n'a jamais ete
 * stoppee, et le pont rejette avec le code `CANCELED` — le web le traduit en
 * `AbortError`, comme une annulation de `navigator.share` : ni copie, ni
 * partage compte. Certaines applications rendent aussi « annule » apres un
 * vrai partage ; elles ont stoppe l'activite en s'ouvrant, d'ou le drapeau
 * (heuristique de `@capacitor/share`). Un refus (rien a partager, aucune
 * application capable) rejette sans code, et le web retombe sur la copie.
 *
 * `shareFile` (#7863) porte un FICHIER : « Enregistrer » d'une story a soi
 * n'avait aucune porte dans la coque, faute de `navigator.share` et de
 * `DownloadListener`. Le contenu arrive en base64, s'ecrit dans le cache
 * (`partages/`, vide a chaque appel) et part par le `FileProvider` deja
 * declare (`file_paths.xml`, `cache-path`), avec la meme feuille et la meme
 * annulation que `share`.
 */
@CapacitorPlugin(name = "MeeshyShare")
public class MeeshySharePlugin extends Plugin {

    private boolean stopped = false;

    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "");
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String body = text.isEmpty() ? url : url.isEmpty() ? text : text + "\n" + url;
        if (body.isEmpty()) {
            call.reject("Rien a partager");
            return;
        }

        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, body);
        if (!title.isEmpty()) {
            send.putExtra(Intent.EXTRA_SUBJECT, title);
        }

        try {
            stopped = false;
            startActivityForResult(call, Intent.createChooser(send, title.isEmpty() ? null : title), "shareResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Aucune application ne sait partager ce lien", e);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String data = call.getString("data", "");
        String mimeType = call.getString("mimeType", "");
        if (data.isEmpty()) {
            call.reject("Rien a partager");
            return;
        }

        Uri uri;
        try {
            File file = writeShared(nomSur(call.getString("fileName", "")), Base64.decode(data, Base64.DEFAULT));
            uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Fichier illisible", e);
            return;
        }

        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType.isEmpty() ? "application/octet-stream" : mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.setClipData(ClipData.newRawUri("", uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            stopped = false;
            startActivityForResult(call, Intent.createChooser(send, null), "shareResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Aucune application ne sait recevoir ce fichier", e);
        }
    }

    private File writeShared(String fileName, byte[] bytes) throws IOException {
        File dir = new File(getContext().getCacheDir(), "partages");
        File[] previous = dir.listFiles();
        if (previous != null) {
            for (File old : previous) {
                old.delete();
            }
        }
        if (!dir.isDirectory() && !dir.mkdirs()) {
            throw new IOException("Cache indisponible");
        }
        File file = new File(dir, fileName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return file;
    }

    private static String nomSur(String fileName) {
        String base = fileName.substring(fileName.lastIndexOf('/') + 1).replaceAll("[^A-Za-z0-9._-]", "_");
        return base.isEmpty() || base.startsWith(".") ? "meeshy" + base : base;
    }

    @ActivityCallback
    private void shareResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED && !stopped) {
            call.reject("Partage annule", "CANCELED");
            return;
        }
        call.resolve();
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        stopped = true;
    }
}
