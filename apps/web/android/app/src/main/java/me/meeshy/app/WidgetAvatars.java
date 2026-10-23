package me.meeshy.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.Typeface;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Comparator;

/**
 * #10626 — les visages des widgets. La page publie une adresse deja resolue ;
 * le natif la telecharge HORS du fil principal (fabrique de liste, executeur
 * des fournisseurs), la reduit a la taille d'une pastille et la garde dans
 * un cache disque borne. Sans photo — ou sans reseau — le cercle de l'accent
 * de la conversation et ses initiales, comme `InitialsAvatar` sur iOS. Le
 * point de presence n'est peint que si la page l'a servi (regle 1/3/5).
 */
final class WidgetAvatars {

    private static final String DIR = "widget-avatars";
    private static final int MAX_FILES = 64;
    private static final int TIMEOUT_MS = 4000;

    private WidgetAvatars() {}

    static Bitmap avatar(Context context, String url, String initials, int accent, Integer presence, int sizePx) {
        Bitmap photo = photo(context, url, sizePx);
        Bitmap base = photo != null ? circle(photo, sizePx) : initialsCircle(initials, accent, sizePx);
        return presence == null ? base : withDot(base, presence);
    }

    private static Bitmap photo(Context context, String url, int sizePx) {
        boolean debug = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!WidgetAvatarRules.isFetchable(url, debug)) return null;
        File file = new File(dir(context), key(url) + ".png");
        if (file.exists()) {
            Bitmap cached = decodeCached(file, sizePx);
            if (cached != null) {
                file.setLastModified(System.currentTimeMillis());
                return cached;
            }
        }
        byte[] bytes = download(url, debug);
        if (bytes == null) return null;
        Bitmap decoded = decodeSampled(bytes, sizePx);
        if (decoded == null) return null;
        Bitmap scaled = Bitmap.createScaledBitmap(decoded, sizePx, sizePx, true);
        save(context, file, scaled);
        return scaled;
    }

    /**
     * Les redirections sont suivies A LA MAIN, au plus deux, chacune
     * revalidee par la garde (`WidgetAvatarRules.redirectTarget`) : suivies
     * par `HttpURLConnection`, elles meneraient sans controle vers n'importe
     * quel hote.
     */
    private static byte[] download(String url, boolean debug) {
        String current = url;
        for (int hop = 0; hop <= WidgetAvatarRules.MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(current).openConnection();
                connection.setConnectTimeout(TIMEOUT_MS);
                connection.setReadTimeout(TIMEOUT_MS);
                connection.setInstanceFollowRedirects(false);
                int code = connection.getResponseCode();
                if (code >= 300 && code < 400) {
                    current = WidgetAvatarRules.redirectTarget(current, connection.getHeaderField("Location"), debug);
                    if (current == null) return null;
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) return null;
                if (!WidgetAvatarRules.acceptsLength(connection.getContentLengthLong())) return null;
                return readCapped(connection);
            } catch (IOException | ClassCastException unreachable) {
                return null;
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        return null;
    }

    private static byte[] readCapped(HttpURLConnection connection) throws IOException {
        try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                if (out.size() + read > WidgetAvatarRules.MAX_BYTES) return null;
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    /** Dimensions lues AVANT le decodage : une image piege est refusee, les autres decodent pres de 2 × la pastille. */
    private static Bitmap decodeSampled(byte[] bytes, int sizePx) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (!WidgetAvatarRules.acceptsDimensions(bounds.outWidth, bounds.outHeight)) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = WidgetAvatarRules.sampleSize(bounds.outWidth, bounds.outHeight, sizePx);
        options.inPreferredConfig = Bitmap.Config.RGB_565;
        Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (decoded == null) return null;
        int side = Math.min(decoded.getWidth(), decoded.getHeight());
        return Bitmap.createBitmap(decoded, (decoded.getWidth() - side) / 2, (decoded.getHeight() - side) / 2, side, side);
    }

    /** #12447 — le cache est relu sous-echantillonne, comme le telechargement. */
    private static Bitmap decodeCached(File file, int sizePx) {
        String path = file.getAbsolutePath();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = WidgetAvatarRules.sampleSize(bounds.outWidth, bounds.outHeight, sizePx);
        return BitmapFactory.decodeFile(path, options);
    }

    private static void save(Context context, File file, Bitmap bitmap) {
        try (FileOutputStream out = new FileOutputStream(file)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        } catch (IOException full) {
            return;
        }
        File[] files = dir(context).listFiles();
        if (files == null || files.length <= MAX_FILES) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (int i = 0; i < files.length - MAX_FILES; i++) files[i].delete();
    }

    /** Une deconnexion efface aussi les visages du compte quitte. */
    static void clear(Context context) {
        File[] files = dir(context).listFiles();
        if (files == null) return;
        for (File file : files) file.delete();
    }

    private static File dir(Context context) {
        File dir = new File(context.getCacheDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private static String key(String url) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(url.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            return Integer.toHexString(url.hashCode());
        }
    }

    private static Bitmap circle(Bitmap source, int sizePx) {
        Bitmap out = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        BitmapShader shader = new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        Matrix matrix = new Matrix();
        float scale = (float) sizePx / Math.min(source.getWidth(), source.getHeight());
        matrix.setScale(scale, scale);
        shader.setLocalMatrix(matrix);
        paint.setShader(shader);
        new Canvas(out).drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f, paint);
        return out;
    }

    static Bitmap initialsCircle(String initials, int accent, int sizePx) {
        Bitmap out = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(accent);
        canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f, fill);
        String text = initials == null || initials.isEmpty() ? "?" : initials;
        Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
        ink.setColor(Color.WHITE);
        ink.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        ink.setTextSize(sizePx * 0.38f);
        ink.setTextAlign(Paint.Align.CENTER);
        Rect bounds = new Rect();
        ink.getTextBounds(text, 0, text.length(), bounds);
        canvas.drawText(text, sizePx / 2f, sizePx / 2f + bounds.height() / 2f, ink);
        return out;
    }

    private static Bitmap withDot(Bitmap base, int color) {
        Bitmap out = base.copy(Bitmap.Config.ARGB_8888, true);
        Canvas canvas = new Canvas(out);
        float size = out.getWidth();
        float radius = size * 0.14f;
        float cx = size - radius - size * 0.02f;
        float cy = size - radius - size * 0.02f;
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setColor(Color.WHITE);
        canvas.drawCircle(cx, cy, radius + size * 0.035f, ring);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(color);
        canvas.drawCircle(cx, cy, radius, dot);
        return out;
    }
}
