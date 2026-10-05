package me.meeshy.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** Les erreurs du SpeechRecognizer dites dans le vocabulaire de Web Speech, comme Chrome Android (#9446). */
public class SpeechErrorsTest {

    @Test
    public void aRefusedMicrophoneIsNotAllowed() {
        assertEquals("not-allowed", SpeechErrors.webError(9));
    }

    @Test
    public void anUnsupportedLanguageIsSaidSo() {
        assertEquals("language-not-supported", SpeechErrors.webError(12));
        assertEquals("language-not-supported", SpeechErrors.webError(13));
    }

    @Test
    public void aMicrophoneFailureIsAudioCapture() {
        assertEquals("audio-capture", SpeechErrors.webError(3));
    }

    @Test
    public void silenceIsNoSpeechAndAnUnheardPhraseIsNoMatch() {
        assertEquals("no-speech", SpeechErrors.webError(6));
        assertEquals("no-match", SpeechErrors.webError(7));
    }

    @Test
    public void aCancelledListeningIsAborted() {
        assertEquals("aborted", SpeechErrors.webError(5));
    }

    @Test
    public void everythingElseIsANetworkFailureTheRestartAbsorbs() {
        assertEquals("network", SpeechErrors.webError(1));
        assertEquals("network", SpeechErrors.webError(2));
        assertEquals("network", SpeechErrors.webError(4));
        assertEquals("network", SpeechErrors.webError(8));
        assertEquals("network", SpeechErrors.webError(42));
    }
}
