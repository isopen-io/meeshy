package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Test;

/** `MeeshyGallery.exists` ne repond que pour un chemin de l'album, present ou supprime (#14654). */
public class GalleryPresenceRulesTest {

    @Test
    public void aFileOfAnAlbumIsInsideEvenOnceDeleted() throws IOException {
        File root = Files.createTempDirectory("media").toFile();
        File album = new File(root, "Meeshy");
        assertTrue(album.mkdirs());
        File photo = new File(album, "a.jpg");
        assertTrue(photo.createNewFile());
        assertTrue(GalleryPresenceRules.insideAlbums(root, photo));
        assertTrue(photo.delete());
        assertTrue(GalleryPresenceRules.insideAlbums(root, photo));
    }

    @Test
    public void anyOtherPathIsOutside() throws IOException {
        File parent = Files.createTempDirectory("app").toFile();
        File root = new File(parent, "media");
        assertTrue(root.mkdirs());
        File secret = new File(parent, "secret.db");
        assertTrue(secret.createNewFile());
        assertFalse(GalleryPresenceRules.insideAlbums(root, secret));
        assertFalse(GalleryPresenceRules.insideAlbums(root, new File(root, "Meeshy/../../secret.db")));
        assertFalse(GalleryPresenceRules.insideAlbums(root, root));
        assertFalse(GalleryPresenceRules.insideAlbums(root, null));
        assertFalse(GalleryPresenceRules.insideAlbums(null, secret));
    }
}
