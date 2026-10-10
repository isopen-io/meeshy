package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.speech.SpeechRecognizer;
import org.junit.Test;

/** Les erreurs du SpeechRecognizer d'Android parlent le vocabulaire de Web Speech (#9446). */
public class SpeechRecognitionRulesTest {

    @Test
    public void aRefusedMicrophoneIsNotAllowed() {
        assertEquals("not-allowed", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS));
    }

    @Test
    public void anUnknownLanguageIsNotSupported() {
        assertEquals("language-not-supported", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED));
        assertEquals("language-not-supported", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE));
        assertEquals("language-not-supported", SpeechRecognitionRules.UNAVAILABLE);
    }

    @Test
    public void aBrokenMicrophoneIsAnAudioCaptureError() {
        assertEquals("audio-capture", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_AUDIO));
    }

    @Test
    public void silenceAndTransientFailuresAreRelaunchedByThePage() {
        assertEquals("no-speech", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_NO_MATCH));
        assertEquals("no-speech", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_SPEECH_TIMEOUT));
        assertEquals("network", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_NETWORK));
        assertEquals("network", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_SERVER));
        assertEquals("aborted", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_RECOGNIZER_BUSY));
        assertEquals("aborted", SpeechRecognitionRules.webError(SpeechRecognizer.ERROR_CLIENT));
    }

    @Test
    public void aContinuousListeningResumesAfterASilence() {
        assertTrue(SpeechRecognitionRules.listensAgain(true, SpeechRecognizer.ERROR_NO_MATCH, 5_000));
        assertTrue(SpeechRecognitionRules.listensAgain(true, SpeechRecognizer.ERROR_SPEECH_TIMEOUT, SpeechRecognitionRules.MIN_LISTEN_MS));
    }

    @Test
    public void itNeverSpinsOnAServiceThatFailsAtOnce() {
        assertFalse(SpeechRecognitionRules.listensAgain(true, SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognitionRules.MIN_LISTEN_MS - 1));
    }

    @Test
    public void onlyASilenceOfAContinuousListeningResumes() {
        assertFalse(SpeechRecognitionRules.listensAgain(false, SpeechRecognizer.ERROR_NO_MATCH, 5_000));
        assertFalse(SpeechRecognitionRules.listensAgain(true, SpeechRecognizer.ERROR_AUDIO, 5_000));
        assertFalse(SpeechRecognitionRules.listensAgain(true, SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS, 5_000));
    }

    @Test
    public void confidenceStaysWithinZeroAndOne() {
        assertEquals(0f, SpeechRecognitionRules.confidence(null), 0f);
        assertEquals(0f, SpeechRecognitionRules.confidence(new float[0]), 0f);
        assertEquals(0f, SpeechRecognitionRules.confidence(new float[] { -1f }), 0f);
        assertEquals(0.82f, SpeechRecognitionRules.confidence(new float[] { 0.82f, 0.1f }), 0f);
    }
}
