package me.meeshy.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/**
 * #9446 — la reconnaissance vocale des sous-titres d'appel, que la WebView
 * n'expose pas (`webkitSpeechRecognition`). Chrome Android l'implemente avec
 * ce meme `SpeechRecognizer`, en mode dictee et avec resultats partiels ; la
 * page la recoit sous le contrat de `SpeechRecognition`
 * (`src/lib/calls/shell-speech.ts`) : `speechResult`, `speechError`, puis
 * `speechEnd`, apres quoi elle relance ou abandonne d'elle-meme.
 */
@CapacitorPlugin(name = "MeeshySpeech")
public class MeeshySpeechPlugin extends Plugin {

    private SpeechRecognizer recognizer;

    @PluginMethod
    public void startListening(PluginCall call) {
        String language = call.getString("language", "");
        boolean partial = Boolean.TRUE.equals(call.getBoolean("partial", Boolean.TRUE));
        getActivity()
            .runOnUiThread(() -> {
                release();
                if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    fail("not-allowed");
                } else if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    fail("service-not-allowed");
                } else {
                    recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                    recognizer.setRecognitionListener(new Listener(recognizer));
                    recognizer.startListening(intent(language, partial));
                }
                call.resolve();
            });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        getActivity()
            .runOnUiThread(() -> {
                release();
                call.resolve();
            });
    }

    @Override
    protected void handleOnDestroy() {
        release();
        super.handleOnDestroy();
    }

    private Intent intent(String language, boolean partial) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        intent.putExtra("android.speech.extra.DICTATION_MODE", true);
        if (language != null && !language.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        return intent;
    }

    private void release() {
        SpeechRecognizer current = recognizer;
        recognizer = null;
        if (current == null) return;
        current.cancel();
        current.destroy();
    }

    private void fail(String error) {
        JSObject data = new JSObject();
        data.put("error", error);
        notifyListeners("speechError", data);
        finish();
    }

    private void finish() {
        release();
        notifyListeners("speechEnd", new JSObject());
    }

    private void heard(Bundle results, boolean isFinal) {
        ArrayList<String> texts = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (texts == null || texts.isEmpty()) return;
        float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
        JSObject data = new JSObject();
        data.put("text", texts.get(0));
        data.put("confidence", scores != null && scores.length > 0 ? (double) scores[0] : 0d);
        data.put("isFinal", isFinal);
        notifyListeners("speechResult", data);
    }

    private final class Listener implements RecognitionListener {

        private final SpeechRecognizer owner;

        Listener(SpeechRecognizer owner) {
            this.owner = owner;
        }

        private boolean current() {
            return owner == recognizer;
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            if (current()) heard(partialResults, false);
        }

        @Override
        public void onResults(Bundle results) {
            if (!current()) return;
            heard(results, true);
            finish();
        }

        @Override
        public void onError(int error) {
            if (!current()) return;
            JSObject data = new JSObject();
            data.put("error", SpeechErrors.webError(error));
            notifyListeners("speechError", data);
            finish();
        }

        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onEvent(int eventType, Bundle params) {}
    }
}
