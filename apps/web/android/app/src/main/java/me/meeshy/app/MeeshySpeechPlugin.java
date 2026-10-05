package me.meeshy.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * La reconnaissance vocale des sous-titres d'un appel (#9446). La WebView n'a
 * pas `webkitSpeechRecognition` ; Chrome Android l'adosse au
 * `SpeechRecognizer` du systeme (dictee, resultats partiels), et la coque fait
 * de meme. La page la recoit au contrat de `SpeechRecognition`
 * (`src/lib/calls/call-shell-speech.ts`).
 *
 * `startListening({ session, lang, continuous, interimResults })` ouvre une
 * ecoute ; ses evenements `speechResult`, `speechError` (vocabulaire Web
 * Speech, {@link SpeechRecognitionRules}) puis `speechEnd` portent le numero
 * de session, et une seule ecoute vit a la fois. Continue, elle reprend
 * d'elle-meme apres chaque phrase et chaque silence, comme celle de Chrome.
 * `stopListening({ session })` la ferme.
 *
 * Le micro est en general deja accorde par l'appel (`getUserMedia`) ; sinon
 * il est demande ici, et un refus rend `not-allowed` puis la fin.
 */
@CapacitorPlugin(
    name = "MeeshySpeech",
    permissions = { @Permission(alias = MeeshySpeechPlugin.MICROPHONE, strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class MeeshySpeechPlugin extends Plugin {

    static final String MICROPHONE = "microphone";

    private final Handler main = new Handler(Looper.getMainLooper());

    /** L'ecoute en cours, touchee uniquement sur le fil principal. */
    private Listening current;

    private static final class Listening {

        final int session;
        final String lang;
        final boolean continuous;
        final boolean interimResults;
        SpeechRecognizer recognizer;
        long startedAt;

        Listening(int session, String lang, boolean continuous, boolean interimResults) {
            this.session = session;
            this.lang = lang;
            this.continuous = continuous;
            this.interimResults = interimResults;
        }
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (call.getInt("session") == null) {
            call.reject("session manquante");
            return;
        }
        if (getPermissionState(MICROPHONE) != PermissionState.GRANTED) {
            requestPermissionForAlias(MICROPHONE, call, "microphoneAnswered");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void microphoneAnswered(PluginCall call) {
        if (getPermissionState(MICROPHONE) == PermissionState.GRANTED) {
            begin(call);
            return;
        }
        int session = call.getInt("session");
        call.resolve();
        main.post(() -> {
            emitError(session, "not-allowed");
            emitEnd(session);
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        Integer session = call.getInt("session");
        call.resolve();
        if (session == null) return;
        main.post(() -> {
            if (current != null && current.session == session) close(true);
        });
    }

    @Override
    protected void handleOnDestroy() {
        main.post(() -> close(false));
        super.handleOnDestroy();
    }

    private void begin(PluginCall call) {
        Listening listening = new Listening(
            call.getInt("session"),
            call.getString("lang", ""),
            Boolean.TRUE.equals(call.getBoolean("continuous", false)),
            Boolean.TRUE.equals(call.getBoolean("interimResults", false))
        );
        call.resolve();
        main.post(() -> open(listening));
    }

    private void open(Listening listening) {
        close(true);
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            emitError(listening.session, SpeechRecognitionRules.UNAVAILABLE);
            emitEnd(listening.session);
            return;
        }
        current = listening;
        listen(listening);
    }

    private void listen(Listening listening) {
        SpeechRecognizer recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        listening.recognizer = recognizer;
        listening.startedAt = SystemClock.elapsedRealtime();
        recognizer.setRecognitionListener(new Listener(listening, recognizer));
        recognizer.startListening(intentFor(listening));
    }

    private Intent intentFor(Listening listening) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, listening.interimResults);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        if (!listening.lang.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, listening.lang);
        return intent;
    }

    /** Une nouvelle ecoute de la meme session, sur un reconnaisseur neuf. */
    private void relisten(Listening listening) {
        listening.recognizer.destroy();
        listen(listening);
    }

    /** Ferme l'ecoute en cours ; `announce` dit sa fin a la page. */
    private void close(boolean announce) {
        Listening listening = current;
        current = null;
        if (listening == null) return;
        if (listening.recognizer != null) {
            listening.recognizer.cancel();
            listening.recognizer.destroy();
        }
        if (announce) emitEnd(listening.session);
    }

    private void emitResult(int session, String transcript, float confidence, boolean isFinal) {
        JSObject data = new JSObject();
        data.put("session", session);
        data.put("transcript", transcript);
        data.put("confidence", confidence);
        data.put("isFinal", isFinal);
        notifyListeners("speechResult", data);
    }

    private void emitError(int session, String error) {
        JSObject data = new JSObject();
        data.put("session", session);
        data.put("error", error);
        notifyListeners("speechError", data);
    }

    private void emitEnd(int session) {
        JSObject data = new JSObject();
        data.put("session", session);
        notifyListeners("speechEnd", data);
    }

    private static String firstTranscript(Bundle bundle) {
        ArrayList<String> texts = bundle == null ? null : bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (texts == null || texts.isEmpty() || texts.get(0) == null || texts.get(0).isEmpty()) return null;
        return texts.get(0);
    }

    private final class Listener implements RecognitionListener {

        private final Listening listening;
        private final SpeechRecognizer recognizer;

        Listener(Listening listening, SpeechRecognizer recognizer) {
            this.listening = listening;
            this.recognizer = recognizer;
        }

        /** Un rappel d'un reconnaisseur deja remplace ou ferme ne dit plus rien. */
        private boolean live() {
            return current == listening && listening.recognizer == recognizer;
        }

        @Override
        public void onPartialResults(Bundle partial) {
            String transcript = firstTranscript(partial);
            if (!live() || !listening.interimResults || transcript == null) return;
            emitResult(listening.session, transcript, 0f, false);
        }

        @Override
        public void onResults(Bundle results) {
            if (!live()) return;
            String transcript = firstTranscript(results);
            if (transcript != null) {
                float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
                emitResult(listening.session, transcript, SpeechRecognitionRules.confidence(scores), true);
            }
            if (listening.continuous) relisten(listening);
            else close(true);
        }

        @Override
        public void onError(int code) {
            if (!live()) return;
            long listened = SystemClock.elapsedRealtime() - listening.startedAt;
            if (SpeechRecognitionRules.listensAgain(listening.continuous, code, listened)) {
                relisten(listening);
                return;
            }
            emitError(listening.session, SpeechRecognitionRules.webError(code));
            close(true);
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
