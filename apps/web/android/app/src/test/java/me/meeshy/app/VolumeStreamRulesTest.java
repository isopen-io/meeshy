package me.meeshy.app;

import static org.junit.Assert.assertEquals;

import android.media.AudioManager;
import org.junit.Test;

/** Ce que reglent les touches de volume dans la coque, comme dans Chrome (#10375). */
public class VolumeStreamRulesTest {

    @Test
    public void outsideACallTheVolumeKeysSetTheMediaVolume() {
        assertEquals(AudioManager.STREAM_MUSIC, VolumeStreamRules.stream(false));
    }

    @Test
    public void duringACallTheVolumeKeysSetTheVoiceVolume() {
        assertEquals(AudioManager.USE_DEFAULT_STREAM_TYPE, VolumeStreamRules.stream(true));
    }
}
