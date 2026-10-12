package me.meeshy.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** Les touches de volume règlent les médias, comme dans Chrome, et la voix pendant un appel (#10375). */
public class VolumeStreamRulesTest {

    @Test
    public void outsideACallTheKeysDriveMediaVolume() {
        assertEquals(VolumeStreamRules.STREAM_MUSIC, VolumeStreamRules.streamFor(false));
        assertEquals(3, VolumeStreamRules.STREAM_MUSIC);
    }

    @Test
    public void duringACallTheSystemPicksTheVoiceStream() {
        assertEquals(VolumeStreamRules.USE_DEFAULT_STREAM_TYPE, VolumeStreamRules.streamFor(true));
        assertEquals(Integer.MIN_VALUE, VolumeStreamRules.USE_DEFAULT_STREAM_TYPE);
    }
}
