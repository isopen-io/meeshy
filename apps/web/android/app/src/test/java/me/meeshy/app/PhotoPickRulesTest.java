package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Choisir une photo ouvre le selecteur de photos du systeme, comme Chrome (#10087). */
public class PhotoPickRulesTest {

    private static String[] accept(String... types) {
        return types;
    }

    @Test
    public void photosOpenThePhotoPicker() {
        assertEquals("image/*", PhotoPickRules.pickerType(33, accept("image/*"), false));
    }

    @Test
    public void videosOpenThePhotoPickerOnVideos() {
        assertEquals("video/*", PhotoPickRules.pickerType(34, accept("video/*"), false));
    }

    @Test
    public void photosAndVideosOpenThePhotoPickerOnBoth() {
        assertEquals("*/*", PhotoPickRules.pickerType(35, accept("image/*", "video/*"), false));
        assertEquals("*/*", PhotoPickRules.pickerType(36, accept(" Image/* ", "video/*", ""), false));
    }

    @Test
    public void theCameraKeepsItsOwnPath() {
        assertNull(PhotoPickRules.pickerType(34, accept("image/*"), true));
    }

    @Test
    public void beforeAndroid13TheFilePickerStays() {
        assertNull(PhotoPickRules.pickerType(32, accept("image/*"), false));
    }

    @Test
    public void anyOtherAcceptKeepsTheFilePicker() {
        assertNull(PhotoPickRules.pickerType(34, accept(), false));
        assertNull(PhotoPickRules.pickerType(34, accept(""), false));
        assertNull(PhotoPickRules.pickerType(34, null, false));
        assertNull(PhotoPickRules.pickerType(34, accept("image/png", "image/webp"), false));
        assertNull(PhotoPickRules.pickerType(34, accept("image/*", "application/pdf"), false));
        assertNull(PhotoPickRules.pickerType(34, accept(".png"), false));
        assertNull(PhotoPickRules.pickerType(34, accept("audio/*", "video/mp4"), false));
    }
}
