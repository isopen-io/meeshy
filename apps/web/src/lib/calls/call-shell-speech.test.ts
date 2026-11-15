import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import type { SpeechResult } from './call-captions-controller';
import { browserSpeech } from './call-speech';
import { recognitionFor, shellRecognition } from './call-shell-speech';

/**
 * **DANS LA COQUE ANDROID, MA VOIX EST SOUS-TITRÉE COMME DEPUIS CHROME** (#9446) —
 * la WebView n'a pas `webkitSpeechRecognition`. La coque qui déclare
 * `MeeshySpeech` prête le `SpeechRecognizer` du système, et la page le reçoit
 * au contrat de `SpeechRecognition` : `browserSpeech` et sa relance restent
 * les mêmes. Un navigateur, ou une coque construite avant le plugin, ne
 * reçoit rien — comportement d'avant.
 */

type Appel = { readonly methode: string; readonly options: Record<string, unknown> };
type Ecouteur = { readonly evenement: string; readonly rappel: (donnees: unknown) => void; retire: boolean };

function coque(options: { readonly methodes?: readonly string[]; readonly demarrage?: 'resout' | 'rejette' } = {}) {
  const appels: Appel[] = [];
  const ecouteurs: Ecouteur[] = [];
  const methodes = options.methodes ?? ['startListening', 'stopListening'];
  const hote: CoqueNative = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshySpeech', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (plugin, methode, opts) => {
      expect(plugin).toBe('MeeshySpeech');
      appels.push({ methode, options: opts as Record<string, unknown> });
      return methode === 'startListening' && options.demarrage === 'rejette' ? Promise.reject(new Error('coque')) : Promise.resolve({});
    },
    addListener: (plugin, evenement, rappel) => {
      expect(plugin).toBe('MeeshySpeech');
      const ecouteur: Ecouteur = { evenement, rappel, retire: false };
      ecouteurs.push(ecouteur);
      return {
        remove: () => {
          ecouteur.retire = true;
          return Promise.resolve();
        },
      };
    },
  };
  const emettre = (evenement: string, donnees: Record<string, unknown>): void => {
    for (const ecouteur of ecouteurs) if (ecouteur.evenement === evenement && !ecouteur.retire) ecouteur.rappel(donnees);
  };
  const demarrages = (): Appel[] => appels.filter((appel) => appel.methode === 'startListening');
  const session = (index: number): unknown => demarrages()[index]?.options.session;
  return { hote, appels, ecouteurs, emettre, session, demarrages };
}

const vide = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('la reconnaissance vocale prêtée par la coque Android (#9446)', () => {
  test('un navigateur, ou une coque sans le plugin ou sans ses deux méthodes, ne reçoit rien', () => {
    expect(shellRecognition(undefined)).toBeNull();
    expect(
      shellRecognition({
        getPlatform: () => 'android',
        PluginHeaders: [],
        nativePromise: () => Promise.resolve({}),
        addListener: () => ({ remove: () => Promise.resolve() }),
      }),
    ).toBeNull();
    expect(shellRecognition(coque({ methodes: ['startListening'] }).hote)).toBeNull();
    const { addListener: _sansEcoute, ...sansEcoute } = coque().hote;
    expect(shellRecognition(sansEcoute)).toBeNull();
    expect(browserSpeech(shellRecognition(undefined))).toBeNull();
  });

  test('elle démarre dans la langue demandée, continue et avec résultats partiels', () => {
    const { hote, appels } = coque();
    const Recognition = shellRecognition(hote);
    expect(Recognition).not.toBeNull();
    browserSpeech(Recognition)?.({ language: 'fr', onResult: () => undefined, onFailure: () => undefined });
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatchObject({ methode: 'startListening', options: { lang: 'fr', continuous: true, interimResults: true } });
    expect(typeof appels[0]?.options.session).toBe('number');
  });

  test('ses résultats partiels puis finaux arrivent au contrat de SpeechRecognition', () => {
    const { hote, emettre, session } = coque();
    const entendus: SpeechResult[] = [];
    browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: (r) => void entendus.push(r), onFailure: () => undefined });
    emettre('speechResult', { session: session(0), transcript: 'bonjour à', confidence: 0, isFinal: false });
    emettre('speechResult', { session: session(0), transcript: 'bonjour à tous', confidence: 0.82, isFinal: true });
    expect(entendus).toEqual([
      { text: 'bonjour à', isFinal: false, confidence: 0 },
      { text: 'bonjour à tous', isFinal: true, confidence: 0.82 },
    ]);
  });

  test('les événements d’une autre écoute sont ignorés', () => {
    const { hote, emettre, session } = coque();
    const entendus: SpeechResult[] = [];
    browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: (r) => void entendus.push(r), onFailure: () => undefined });
    emettre('speechResult', { session: Number(session(0)) + 1000, transcript: 'pas moi', confidence: 1, isFinal: true });
    emettre('speechEnd', { session: Number(session(0)) + 1000 });
    expect(entendus).toEqual([]);
  });

  test('la fin d’une écoute relance la suivante, comme dans Chrome', () => {
    const { hote, emettre, session, demarrages } = coque();
    browserSpeech(shellRecognition(hote))?.({ language: 'en', onResult: () => undefined, onFailure: () => undefined });
    emettre('speechEnd', { session: session(0) });
    expect(demarrages()).toHaveLength(2);
    expect(session(1)).not.toBe(session(0));
  });

  test('un refus du micro se dit « not-allowed » : refusé, jamais relancé', () => {
    const { hote, emettre, session, demarrages } = coque();
    const echecs: string[] = [];
    browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: () => undefined, onFailure: (raison) => void echecs.push(raison) });
    emettre('speechError', { session: session(0), error: 'not-allowed' });
    emettre('speechEnd', { session: session(0) });
    expect(echecs).toEqual(['denied']);
    expect(demarrages()).toHaveLength(1);
  });

  test('une langue non reconnue ou un micro injoignable rendent la capture indisponible', () => {
    for (const erreur of ['language-not-supported', 'audio-capture']) {
      const { hote, emettre, session, demarrages } = coque();
      const echecs: string[] = [];
      browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: () => undefined, onFailure: (raison) => void echecs.push(raison) });
      emettre('speechError', { session: session(0), error: erreur });
      emettre('speechEnd', { session: session(0) });
      expect(echecs).toEqual(['unavailable']);
      expect(demarrages()).toHaveLength(1);
    }
  });

  test('un silence (« no-speech ») n’arrête rien : la fin qui suit relance', () => {
    const { hote, emettre, session, demarrages } = coque();
    const echecs: string[] = [];
    browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: () => undefined, onFailure: (raison) => void echecs.push(raison) });
    emettre('speechError', { session: session(0), error: 'no-speech' });
    emettre('speechEnd', { session: session(0) });
    expect(echecs).toEqual([]);
    expect(demarrages()).toHaveLength(2);
  });

  test('arrêter la capture arrête l’écoute native et retire ses écouteurs', () => {
    const { hote, appels, ecouteurs, emettre, session, demarrages } = coque();
    const entendus: SpeechResult[] = [];
    const capture = browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: (r) => void entendus.push(r), onFailure: () => undefined });
    capture?.stop();
    expect(appels.at(-1)).toEqual({ methode: 'stopListening', options: { session: session(0) } });
    expect(ecouteurs.length).toBeGreaterThan(0);
    expect(ecouteurs.every((ecouteur) => ecouteur.retire)).toBe(true);
    emettre('speechResult', { session: session(0), transcript: 'trop tard', confidence: 1, isFinal: true });
    expect(entendus).toEqual([]);
    expect(demarrages()).toHaveLength(1);
  });

  test('une coque qui refuse de démarrer rend une erreur « audio-capture » puis la fin', async () => {
    const Recognition = shellRecognition(coque({ demarrage: 'rejette' }).hote);
    if (Recognition === null) throw new Error('coque attendue');
    const recognition = new Recognition();
    const vus: string[] = [];
    recognition.onerror = (evenement) => void vus.push(`error:${evenement.error}`);
    recognition.onend = () => void vus.push('end');
    recognition.start();
    await vide();
    expect(vus).toEqual(['error:audio-capture', 'end']);
  });

  test('une reconnaissance ne démarre qu’une fois, comme SpeechRecognition', () => {
    const Recognition = shellRecognition(coque().hote);
    if (Recognition === null) throw new Error('coque attendue');
    const recognition = new Recognition();
    recognition.start();
    expect(() => recognition.start()).toThrow();
  });

  test('la page prend la reconnaissance du navigateur quand il en a une, celle de la coque sinon', () => {
    const { hote } = coque();
    class Navigateur {}
    expect(recognitionFor({ webkitSpeechRecognition: Navigateur }, hote)).toBe(Navigateur as never);
    const pretee = recognitionFor({}, hote);
    expect(pretee).not.toBeNull();
    expect(pretee).not.toBe(Navigateur as never);
    expect(recognitionFor({}, undefined)).toBeNull();
    expect(recognitionFor(null, undefined)).toBeNull();
  });
});
