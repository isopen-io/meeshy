import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

import type { Recognition, RecognitionConstructor } from './call-speech';

/**
 * **LA RECONNAISSANCE VOCALE PRÊTÉE PAR LA COQUE ANDROID** (#9446) — la
 * WebView n'a pas `webkitSpeechRecognition`. Chrome Android l'implémente avec
 * le `SpeechRecognizer` du système ; le plugin `MeeshySpeech` fait de même, et
 * ce module le présente sous le contrat de `SpeechRecognition` : la page garde
 * `browserSpeech`, ses relances et ses refus.
 *
 * Chaque écoute porte ses trois abonnements (`speechResult`, `speechError`,
 * `speechEnd`) et les retire à sa fin : l'écoute relancée ne reçoit jamais les
 * événements de la précédente.
 */

const PLUGIN = 'MeeshySpeech';

type Heard = { readonly text?: unknown; readonly confidence?: unknown; readonly isFinal?: unknown };

const texte = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : '');

function resultEvent(donnees: unknown): Parameters<NonNullable<Recognition['onresult']>>[0] {
  const heard = (donnees ?? {}) as Heard;
  const confidence = typeof heard.confidence === 'number' ? heard.confidence : 0;
  const result = Object.assign([{ transcript: texte(heard.text), confidence }], { isFinal: heard.isFinal === true });
  return { resultIndex: 0, results: Object.assign([result], { length: 1 }) };
}

export function shellRecognition(coque: CoqueNative | undefined = coqueCourante()): RecognitionConstructor | null {
  const demarrer = appelNatifMethode(coque, PLUGIN, 'startListening');
  const arreter = appelNatifMethode(coque, PLUGIN, 'stopListening');
  const addListener = coque?.addListener;
  if (demarrer === null || arreter === null || typeof addListener !== 'function') return null;
  return class ShellRecognition implements Recognition {
    lang = '';
    continuous = false;
    interimResults = false;
    onresult: Recognition['onresult'] = null;
    onerror: Recognition['onerror'] = null;
    onend: Recognition['onend'] = null;
    private abonnements: ReadonlyArray<{ readonly remove: () => Promise<void> }> = [];

    private retirer(): void {
      for (const abonnement of this.abonnements) void abonnement.remove().catch(() => {});
      this.abonnements = [];
    }

    private finir(): void {
      this.retirer();
      this.onend?.();
    }

    start(): void {
      this.retirer();
      this.abonnements = [
        addListener(PLUGIN, 'speechResult', (donnees) => this.onresult?.(resultEvent(donnees))),
        addListener(PLUGIN, 'speechError', (donnees) => this.onerror?.({ error: texte((donnees as { readonly error?: unknown } | null)?.error) })),
        addListener(PLUGIN, 'speechEnd', () => this.finir()),
      ];
      demarrer({ language: this.lang, partial: this.interimResults }).catch(() => {
        this.onerror?.({ error: 'service-not-allowed' });
        this.finir();
      });
    }

    abort(): void {
      this.retirer();
      void arreter({}).catch(() => {});
    }
  };
}
