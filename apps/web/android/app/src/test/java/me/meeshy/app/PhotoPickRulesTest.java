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
    public void preciseImageTypesOpenThePhotoPickerOnPhotos() {
        assertEquals("image/*", PhotoPickRules.pickerType(34,
                accept("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"), false));
        assertEquals("image/*", PhotoPickRules.pickerType(33, accept("image/png", "image/*"), false));
    }

    @Test
    public void aSinglePreciseTypeFiltersThePhotoPickerOnIt() {
        assertEquals("image/png", PhotoPickRules.pickerType(34, accept(" Image/PNG "), false));
        assertEquals("video/mp4", PhotoPickRules.pickerType(34, accept("video/mp4", "video/mp4"), false));
    }

    @Test
    public void precisePhotosAndVideosOpenThePhotoPickerOnBoth() {
        assertEquals("*/*", PhotoPickRules.pickerType(34, accept("image/jpeg", "video/mp4"), false));
    }

    @Test
    public void anyOtherAcceptKeepsTheFilePicker() {
        assertNull(PhotoPickRules.pickerType(34, accept(), false));
        assertNull(PhotoPickRules.pickerType(34, accept(""), false));
        assertNull(PhotoPickRules.pickerType(34, null, false));
        assertNull(PhotoPickRules.pickerType(34, accept("image/*", "application/pdf"), false));
        assertNull(PhotoPickRules.pickerType(34, accept(".png"), false));
        assertNull(PhotoPickRules.pickerType(34, accept("audio/*", "video/mp4"), false));
        assertNull(PhotoPickRules.pickerType(34, accept("image/"), false));
        assertNull(PhotoPickRules.pickerType(34, accept("image/png", ".jpg"), false));
        assertNull(PhotoPickRules.pickerType(34, accept("imagery/png"), false));
    }
}
