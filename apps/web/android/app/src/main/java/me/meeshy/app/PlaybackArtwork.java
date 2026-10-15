package me.meeshy.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.LruCache;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * L'image de la carte de lecture (#10624), comme `NowPlayingArtwork` iOS :
 * l'avatar plein cadre avec l'icone de l'app en badge en bas a gauche, et
 * l'icone seule quand la page ne remet aucun avatar (vocal protege, auteur
 * sans photo). L'avatar est telecharge UNE fois, hors du fil principal, sous
 * la garde de {@link PlaybackArtworkRules}, petit (echantillonne), et garde en
 * memoire bornee par adresse.
 */
final class PlaybackArtwork {

    interface Ready {
        void onArtwork(String url, Bitmap artwork);
    }

    private static final String TAG = "MeeshyPlayback";
    private static final int SIDE = 512;
    private static final String APP_ICON = "";
    private static final LruCache<String, Bitmap> CACHE = new LruCache<>(8);
    private static final ExecutorService LOADER = Executors.newSingleThreadExecutor();

    private PlaybackArtwork() {}

    private static String keyOf(String url) {
        return url == null ? APP_ICON : url;
    }

    static Bitmap cached(String url) {
        return CACHE.get(keyOf(url));
    }

    /** Compose l'image de {@code url} hors du fil principal, puis la rend au fil principal. */
    static void load(Context context, String url, Ready ready) {
        Context app = context.getApplicationContext();
        Handler main = new Handler(Looper.getMainLooper());
        LOADER.execute(() -> {
            String key = keyOf(url);
            Bitmap artwork = CACHE.get(key);
            if (artwork == null) {
                boolean debug = (app.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
                artwork = compose(url == null ? null : fetch(url, debug), app);
                CACHE.put(key, artwork);
            }
            Bitmap done = artwork;
            main.post(() -> ready.onArtwork(url, done));
        });
    }

    /**
     * L'avatar, sous la garde de {@link PlaybackArtworkRules} : hote Meeshy seul,
     * redirections suivies a la main et revalidees, octets et dimensions bornes.
     */
    private static Bitmap fetch(String address, boolean debug) {
        byte[] bytes = download(address, debug);
        if (bytes == null) return null;
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (!PlaybackArtworkRules.acceptsDimensions(bounds.outWidth, bounds.outHeight)) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = PlaybackArtworkRules.sampleSize(bounds.outWidth, bounds.outHeight, SIDE);
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
    }

    private static byte[] download(String address, boolean debug) {
        if (!PlaybackArtworkRules.isFetchable(address, debug)) return null;
        String current = address;
        for (int hop = 0; hop <= PlaybackArtworkRules.MAX_REDIRECTS && current != null; hop++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(current).openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(5_000);
                connection.setReadTimeout(5_000);
                int status = connection.getResponseCode();
                if (status / 100 == 3) {
                    current = PlaybackArtworkRules.redirectTarget(current, connection.getHeaderField("Location"), debug);
                    continue;
                }
                if (status / 100 != 2 || !PlaybackArtworkRules.acceptsLength(connection.getContentLengthLong())) return null;
                return read(connection.getInputStream());
            } catch (IOException | RuntimeException failed) {
                Log.w(TAG, "image de lecture indisponible", failed);
                return null;
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        return null;
    }

    private static byte[] read(InputStream input) throws IOException {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            for (int count = in.read(buffer); count != -1; count = in.read(buffer)) {
                if (out.size() + count > PlaybackArtworkRules.MAX_BYTES) return null;
                out.write(buffer, 0, count);
            }
            return out.toByteArray();
        }
    }

    private static Bitmap compose(Bitmap avatar, Context context) {
        Bitmap canvasBitmap = Bitmap.createBitmap(SIDE, SIDE, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(canvasBitmap);
        Drawable icon = context.getPackageManager().getApplicationIcon(context.getApplicationInfo());
        if (avatar == null) {
            icon.setBounds(0, 0, SIDE, SIDE);
            icon.draw(canvas);
            return canvasBitmap;
        }
        int crop = Math.min(avatar.getWidth(), avatar.getHeight());
        int left = (avatar.getWidth() - crop) / 2;
        int top = (avatar.getHeight() - crop) / 2;
        canvas.drawBitmap(avatar, new Rect(left, top, left + crop, top + crop), new Rect(0, 0, SIDE, SIDE), null);
        int[] badge = PlaybackRules.badge(SIDE);
        float radius = (badge[2] - badge[0]) * 0.22f;
        Path clip = new Path();
        clip.addRoundRect(new RectF(badge[0], badge[1], badge[2], badge[3]), radius, radius, Path.Direction.CW);
        canvas.save();
        canvas.clipPath(clip);
        icon.setBounds(badge[0], badge[1], badge[2], badge[3]);
        icon.draw(canvas);
        canvas.restore();
        return canvasBitmap;
    }
}
