import { appelNatifMethode, type CoqueNative } from '@/lib/native-shell';

import { recognitionOf, type Recognition, type RecognitionConstructor } from './call-speech';

/**
 * **LA RECONNAISSANCE VOCALE PRÊTÉE PAR LA COQUE ANDROID** (#9446) — la WebView
 * n'a pas `webkitSpeechRecognition` ; Chrome Android l'adosse au
 * `SpeechRecognizer` du système, et la coque fait de même par
 * `MeeshySpeechPlugin`. Ce module le rend à la page sous la forme d'un
 * constructeur au contrat de `SpeechRecognition` : `browserSpeech`, sa
 * relance et sa lecture des erreurs ne savent pas d'où vient la voix.
 *
 * Chaque écoute porte un numéro de session que la coque recopie sur ses
 * événements (`speechResult`, `speechError`, `speechEnd`) : ceux d'une écoute
 * close n'atteignent jamais la suivante. Un navigateur, ou une coque construite
 * avant le plugin, reçoit `null` — le comportement d'avant.
 */

const PLUGIN = 'MeeshySpeech';

type Handle = { readonly remove: () => Promise<void> };
type Payload = {
  readonly session?: unknown;
  readonly transcript?: unknown;
  readonly confidence?: unknown;
  readonly isFinal?: unknown;
  readonly error?: unknown;
};

let sessions = 0;

export function shellRecognition(coque: CoqueNative | undefined): RecognitionConstructor | null {
  const startListening = appelNatifMethode(coque, PLUGIN, 'startListening');
  const stopListening = appelNatifMethode(coque, PLUGIN, 'stopListening');
  const addListener = coque?.addListener;
  if (startListening === null || stopListening === null || typeof addListener !== 'function') return null;

  return class ShellRecognition implements Recognition {
    lang = '';
    continuous = false;
    interimResults = false;
    onresult: Recognition['onresult'] = null;
    onerror: Recognition['onerror'] = null;
    onend: Recognition['onend'] = null;
    private session = 0;
    private ended = false;
    private handles: Handle[] = [];

    start(): void {
      if (this.session !== 0) throw new DOMException('La reconnaissance est déjà démarrée', 'InvalidStateError');
      sessions += 1;
      const session = sessions;
      this.session = session;
      const own = (raw: unknown): Payload | null => {
        const payload = (raw ?? {}) as Payload;
        return !this.ended && payload.session === session ? payload : null;
      };
      this.handles = [
        addListener(PLUGIN, 'speechResult', (raw) => {
          const payload = own(raw);
          if (payload !== null) this.deliver(payload);
        }),
        addListener(PLUGIN, 'speechError', (raw) => {
          const payload = own(raw);
          if (payload !== null && typeof payload.error === 'string') this.onerror?.({ error: payload.error });
        }),
        addListener(PLUGIN, 'speechEnd', (raw) => {
          if (own(raw) !== null) this.finish();
        }),
      ];
      startListening({ session, lang: this.lang, continuous: this.continuous, interimResults: this.interimResults }).catch(() => {
        if (this.ended) return;
        this.onerror?.({ error: 'audio-capture' });
        this.finish();
      });
    }

    abort(): void {
      if (this.session === 0 || this.ended) return;
      stopListening({ session: this.session }).catch(() => {});
      this.finish();
    }

    private deliver(payload: Payload): void {
      if (typeof payload.transcript !== 'string') return;
      const alternative = { transcript: payload.transcript, confidence: typeof payload.confidence === 'number' ? payload.confidence : 0 };
      const result = { isFinal: payload.isFinal === true, length: 1, 0: alternative };
      this.onresult?.({ resultIndex: 0, results: { length: 1, 0: result } });
    }

    private finish(): void {
      if (this.ended) return;
      this.ended = true;
      for (const handle of this.handles) void Promise.resolve(handle.remove()).catch(() => {});
      this.handles = [];
      this.onend?.();
    }
  };
}

/**
 * La reconnaissance d'un appel : celle du navigateur quand il en a une — Chrome,
 * Edge, Safari, et toute WebView qui l'aurait un jour —, celle de la coque
 * sinon.
 */
export function recognitionFor(scope: object | null, coque: CoqueNative | undefined): RecognitionConstructor | null {
  return recognitionOf(scope) ?? shellRecognition(coque);
}
