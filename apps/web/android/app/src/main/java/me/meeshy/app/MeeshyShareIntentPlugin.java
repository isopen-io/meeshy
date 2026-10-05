package me.meeshy.app;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.core.content.IntentCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

/**
 * L'entree systeme d'un PARTAGE (#8884). Les filtres {@code SEND} /
 * {@code SEND_MULTIPLE} de {@code AndroidManifest.xml} inscrivent Meeshy dans
 * la feuille de partage d'Android : une image, une video ou un lien partage
 * depuis une autre application arrive sur {@code MainActivity} (singleTask,
 * donc par {@code onNewIntent}). Ce pont le relaie a la feuille d'envoi du web
 * ({@code src/lib/share-incoming/native-inbox.ts}).
 *
 * Une WebView ne lit pas un {@code content://} d'une autre application, et la
 * permission de lecture que l'intent accorde n'est valable que le temps de la
 * tache : les contenus sont donc COPIES, des la reception, en fichiers
 * temporaires du cache de la coque (dix fichiers, 100 Mo au plus —
 * {@link ShareIntentRules}), hors du fil principal. Le web les lit par l'adresse
 * locale de la WebView, comme le fait {@code @capacitor/camera} pour ses photos.
 *
 * Deux methodes, separees pour que rien ne soit supprime avant d'etre lu :
 * {@code consume} rend le partage en attente UNE fois (un lancement a froid
 * l'attend), {@code release} efface les temporaires. L'evenement
 * {@code shareReceived} — RETENU jusqu'a ce que le web s'abonne, comme
 * {@code appUrlOpen} de {@link MeeshyLinksPlugin} — reveille le web quand un
 * partage arrive application ouverte.
 *
 * Non compile dans l'environnement qui a ecrit ce fichier : les regles pures
 * sont testees sur la JVM ({@code ShareIntentRulesTest}), le reste suit le
 * patron de {@link MeeshyClipboardPlugin} et {@link MeeshyLinksPlugin}.
 */
@CapacitorPlugin(name = "MeeshyShareIntent")
public class MeeshyShareIntentPlugin extends Plugin {

    private static final String DIRECTORY = "share-incoming";
    private static final long CONSUME_TIMEOUT_SECONDS = 60;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    // Le partage en attente et le dossier de SON lot, sous verrou : un second
    // partage remplace le premier, et `release` ne doit jamais effacer un lot
    // qui n'a pas encore ete pris.
    private Future<JSObject> pending;
    private File pendingBatch;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !ShareIntentRules.isShareAction(intent.getAction())) {
            return;
        }
        final List<Uri> streams = streamsOf(intent);
        final String intentType = intent.getType();
        final String text = ShareIntentRules.boundedText(intent.getCharSequenceExtra(Intent.EXTRA_TEXT));
        final String subject = ShareIntentRules.boundedText(intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT));
        // L'intent de lancement est rejoue si l'activite est recreee (reprise du
        // moteur de rendu, changement de configuration) : une fois lu, il n'est
        // plus un partage, sans quoi le meme partage s'ouvrirait deux fois.
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.setClipData(null);

        final File batch = new File(new File(getContext().getCacheDir(), DIRECTORY), Long.toString(System.nanoTime()));
        FutureTask<JSObject> copy = new FutureTask<>(() -> {
            JSObject share = copied(batch, streams, intentType, text, subject);
            notifyListeners("shareReceived", new JSObject(), true);
            return share;
        });
        // Publie AVANT de lancer : l'evenement part a la fin de la copie, et le web
        // qui reagit en appelant `consume` doit deja trouver le partage en attente.
        synchronized (this) {
            pending = copy;
            pendingBatch = batch;
        }
        executor.execute(copy);
    }

    /** Le partage en attente, une seule fois ; un objet vide quand il n'y en a pas. */
    @PluginMethod
    public void consume(PluginCall call) {
        Future<JSObject> taken;
        synchronized (this) {
            taken = pending;
            pending = null;
        }
        if (taken == null) {
            call.resolve(new JSObject());
            return;
        }
        try {
            call.resolve(taken.get(CONSUME_TIMEOUT_SECONDS, TimeUnit.SECONDS));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.resolve(new JSObject());
        }
    }

    /** Efface les temporaires deja lus — tous, sauf le lot d'un partage qui attend encore. */
    @PluginMethod
    public void release(PluginCall call) {
        executor.execute(() -> {
            File keep;
            synchronized (this) {
                keep = pendingBatch != null && pending != null ? pendingBatch : null;
            }
            deleteChildrenExcept(new File(getContext().getCacheDir(), DIRECTORY), keep);
            call.resolve();
        });
    }

    private static List<Uri> streamsOf(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        List<Uri> many = IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        if (many != null) {
            uris.addAll(many);
        }
        Uri one = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        if (one != null) {
            uris.add(one);
        }
        ClipData clip = intent.getClipData();
        if (uris.isEmpty() && clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) {
                    uris.add(uri);
                }
            }
        }
        return uris;
    }

    private JSObject copied(File batch, List<Uri> streams, String intentType, String text, String subject) {
        deleteChildrenExcept(batch.getParentFile(), batch);
        batch.mkdirs();
        ContentResolver resolver = getContext().getContentResolver();
        JSArray files = new JSArray();
        long used = 0;
        String ownPackage = getContext().getPackageName();
        for (int i = 0; i < streams.size() && files.length() < ShareIntentRules.MAX_FILES; i++) {
            Uri uri = streams.get(i);
            if (!ShareIntentRules.isForeignContent(uri.getScheme(), uri.getAuthority(), ownPackage)) {
                continue;
            }
            String mimeType = resolver.getType(uri);
            if (mimeType == null) {
                mimeType = intentType;
            }
            if (!ShareIntentRules.isAcceptedMime(mimeType)) {
                continue;
            }
            String name = ShareIntentRules.fileNameFor(displayNameOf(resolver, uri), mimeType, i);
            File target = new File(batch, i + "-" + name);
            long size = copyCapped(resolver, uri, target, ShareIntentRules.remainingBytes(used));
            if (size < 0) {
                continue;
            }
            used += size;
            JSObject file = new JSObject();
            file.put("path", target.getAbsolutePath());
            file.put("name", name);
            file.put("mimeType", mimeType);
            file.put("size", size);
            files.put(file);
        }
        JSObject share = new JSObject();
        share.put("files", files);
        share.put("text", text);
        share.put("subject", subject);
        return share;
    }

    private static String displayNameOf(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                return cursor.getString(0);
            }
        } catch (RuntimeException e) {
            // Un fournisseur qui refuse la requete : le fichier sera numerote.
        }
        return null;
    }

    /** Copie {@code uri} dans {@code target} ; {@code -1} s'il depasse {@code limit} ou est illisible. */
    private static long copyCapped(ContentResolver resolver, Uri uri, File target, long limit) {
        long copied = 0;
        try (InputStream input = resolver.openInputStream(uri); OutputStream output = new FileOutputStream(target)) {
            if (input == null) {
                return -1;
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                copied += read;
                if (copied > limit) {
                    target.delete();
                    return -1;
                }
                output.write(buffer, 0, read);
            }
            return copied;
        } catch (IOException | SecurityException e) {
            // Une URI revoquee ou illisible : le fichier est ecarte, les autres partent.
            target.delete();
            return -1;
        }
    }

    private static void deleteChildrenExcept(File directory, File keep) {
        File[] children = directory == null ? null : directory.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (keep == null || !child.equals(keep)) {
                deleteTree(child);
            }
        }
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteTree(child);
            }
        }
        file.delete();
    }
}
