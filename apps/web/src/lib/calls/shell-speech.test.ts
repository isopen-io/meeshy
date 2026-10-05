import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import type { SpeechResult } from './call-captions-controller';
import { browserSpeech } from './call-speech';
import { shellRecognition } from './shell-speech';

/**
 * **MA VOIX EST SOUS-TITRÉE DEPUIS LA COQUE ANDROID, COMME DEPUIS CHROME**
 * (#9446) — la WebView n'a pas `webkitSpeechRecognition` : la coque prête le
 * `SpeechRecognizer` du système (celui qu'emploie Chrome Android) sous le
 * contrat de `SpeechRecognition`, et la page garde sa logique de relance.
 */

type Appel = { readonly methode: string; readonly options: object };
type Ecoute = { readonly evenement: string; readonly rappel: (donnees: unknown) => void; retiree: boolean };

function coque(methodes: readonly string[]): CoqueNative & { readonly appels: Appel[]; readonly ecoutes: Ecoute[] } {
  const appels: Appel[] = [];
  const ecoutes: Ecoute[] = [];
  return {
    appels,
    ecoutes,
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshySpeech', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (_plugin, methode, options) => {
      appels.push({ methode, options });
      return Promise.resolve({});
    },
    addListener: (_plugin, evenement, rappel) => {
      const ecoute: Ecoute = { evenement, rappel, retiree: false };
      ecoutes.push(ecoute);
      return {
        remove: async () => {
          ecoute.retiree = true;
        },
      };
    },
  };
}

const emettre = (hote: { readonly ecoutes: Ecoute[] }, evenement: string, donnees: unknown = {}): void => {
  for (const ecoute of [...hote.ecoutes]) if (ecoute.evenement === evenement && !ecoute.retiree) ecoute.rappel(donnees);
};

const demarrages = (hote: { readonly appels: Appel[] }): Appel[] => hote.appels.filter((appel) => appel.methode === 'startListening');

const MOTS = ['startListening', 'stopListening'];

describe('la reconnaissance vocale prêtée par la coque Android (#9446)', () => {
  test('un navigateur, ou une coque construite avant le plugin, ne promet rien', () => {
    expect(shellRecognition(undefined)).toBeNull();
    expect(shellRecognition(coque(['startListening']))).toBeNull();
  });

  test('elle écoute dans la langue demandée, et remet les résultats partiels puis finaux', () => {
    const hote = coque(MOTS);
    const entendus: SpeechResult[] = [];
    browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: (r) => void entendus.push(r), onFailure: () => undefined });
    expect(demarrages(hote)).toEqual([{ methode: 'startListening', options: { language: 'fr', partial: true } }]);
    emettre(hote, 'speechResult', { text: 'bonjour à', confidence: 0, isFinal: false });
    emettre(hote, 'speechResult', { text: 'bonjour à tous', confidence: 0.8, isFinal: true });
    expect(entendus).toEqual([
      { text: 'bonjour à', isFinal: false, confidence: 0 },
      { text: 'bonjour à tous', isFinal: true, confidence: 0.8 },
    ]);
  });

  test('une fin après un silence relance l’écoute, sans laisser d’écoute orpheline', () => {
    const hote = coque(MOTS);
    browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: () => undefined, onFailure: () => undefined });
    emettre(hote, 'speechError', { error: 'no-speech' });
    emettre(hote, 'speechEnd');
    expect(demarrages(hote)).toHaveLength(2);
    expect(hote.ecoutes.filter((e) => !e.retiree)).toHaveLength(3);
  });

  test('un micro refusé arrête la capture : la page le dit, sans relancer', () => {
    const hote = coque(MOTS);
    const echecs: string[] = [];
    browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: () => undefined, onFailure: (raison) => void echecs.push(raison) });
    emettre(hote, 'speechError', { error: 'not-allowed' });
    emettre(hote, 'speechEnd');
    expect(echecs).toEqual(['denied']);
    expect(demarrages(hote)).toHaveLength(1);
  });

  test('arrêter rend le micro à la coque et retire chaque écoute', () => {
    const hote = coque(MOTS);
    const capture = browserSpeech(shellRecognition(hote))?.({ language: 'fr', onResult: () => undefined, onFailure: () => undefined });
    capture?.stop();
    expect(hote.appels.map((appel) => appel.methode)).toEqual(['startListening', 'stopListening']);
    expect(hote.ecoutes.every((e) => e.retiree)).toBe(true);
  });
});
