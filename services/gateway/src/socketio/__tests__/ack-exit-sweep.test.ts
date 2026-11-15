/**
 * Le cliquet des SORTIES d'acquittement.
 *
 * Sa raison d'être, le coût mesuré de la forme fautive et la définition de
 * « rendre » vivent dans `ack-exit-sweep.ts` — ici ne vivent que l'inventaire
 * et ce qu'il gèle.
 *
 * **Trois cliquets sur la même porte, et aucun ne subsume les autres** :
 *
 * - `ack-door-sweep` garde la FORME de la déclaration — lue sur le contrat
 *   plutôt que réécrite ;
 * - le COMPILATEUR garde la CHARGE — un `ack?.({ … })` dont la forme n'est pas
 *   celle du contrat est une erreur `TS2353`/`TS2345` ;
 * - celui-ci garde que la porte soit OUVERTE. Une porte bien déclarée, bien
 *   typée, et jamais franchie est verte aux deux premiers.
 *
 * C'est le premier cliquet du contrat socket à regarder un CHEMIN D'EXÉCUTION
 * et non un NOM ou une FORME : les six autres énumèrent des noms déclarés,
 * émis, lus, et des parités de plateforme.
 *
 * **Pourquoi un inventaire GELÉ plutôt que VIDE**, et c'est une mesure, pas une
 * commodité. Les dix sorties restantes appartiennent aux DEUX acquittements de
 * transcription, et **aucun client ne les attend** : iOS émet
 * `call:transcription-active` et `call:transcription-segment` en « tire et
 * oublie » (`MessageSocketManager+CallSignaling.swift`), le web et Android ne
 * les émettent pas du tout. Leur acquittement n'est rendu que par l'admission
 * e2ee (`admitCallCaptions` / `settleCallCaptionsAdmission`), à qui le handler
 * PASSE son rappel — donc un refus de chiffrement acquitte, et rien d'autre, pas
 * même le succès.
 *
 * Ce qu'il faut en faire — les rendre, ou les retirer du contrat — est un
 * verdict de PRODUIT, pas une correction : un acquittement que personne
 * n'attend n'a pas de bonne réponse par défaut, et trancher ici substituerait
 * mon verdict au sien (même partage que #18499 et #18342). Le gel est donc une
 * DÉCISION écrite, et le suivi vit dans #18632.
 *
 * **Quand ce témoin tombe :**
 *
 * - une entrée EN TROP = une sortie neuve ne rend pas son acquittement. La
 *   réparation est de l'appeler, jamais d'ajouter une ligne — une sortie muette
 *   n'est légitime que si AUCUN appelant n'attend, et cela se mesure sur les
 *   trois clients, pas au site ;
 * - une entrée EN MOINS = une sortie a été acquittée. Retirer sa ligne fait
 *   partie du correctif.
 *
 * L'inventaire est clé par FICHIER + HANDLER + LIGNE SOURCE, **jamais** par
 * numéro de ligne (règle du cycle 87 bis). Deux sorties dont la ligne source
 * est identique (`return;` nu) partagent donc une entrée : la clé nomme la
 * FAUTE, elle ne compte pas les occurrences — et une occurrence qui subsiste
 * garde son entrée vivante.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepSilentAckExits } from './ack-exit-sweep';

const SRC_DIR = join(__dirname, '..', '..');

const TRANSCRIPTION_ACTIVE =
  "socket.on(CALL_EVENTS.TRANSCRIPTION_ACTIVE, async (data: CallTranscriptionActiveEvent, ack?: AckOf<typeof CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE>) => {";
const TRANSCRIPTION_SEGMENT =
  "socket.on(CALL_EVENTS.TRANSCRIPTION_SEGMENT, async (data: CallTranscriptionSegmentEvent, ack?: AckOf<typeof CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT>) => {";

/**
 * Les dix sorties des deux acquittements de transcription, mesurées sans
 * attente client (cf. l'en-tête). À TRANCHER, pas à faire grossir.
 */
const FROZEN_SILENT_EXITS: ReadonlyArray<{ file: string; handler: string; exit: string }> = [
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_ACTIVE, exit: 'if (!userId) return;' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_ACTIVE, exit: 'if (!rateLimitPassed) return;' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_ACTIVE, exit: 'if (!validation.success) return;' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_ACTIVE, exit: 'if (!participantId) return;' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_ACTIVE, exit: 'catch' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_SEGMENT, exit: 'if (!userId) return;' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_SEGMENT, exit: 'if (!rateLimitPassed) return;' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_SEGMENT, exit: 'if (!validation.success) return;' },
  { file: 'socketio/CallEventsHandler.ts', handler: TRANSCRIPTION_SEGMENT, exit: 'catch' },
  {
    file: 'socketio/call-transcription-segment.ts',
    handler: "readonly ack?: AckOf<typeof CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT>;",
    exit: 'return;',
  },
];

const key = (e: { file: string; handler: string; exit: string }): string =>
  `${e.file} :: ${e.handler} :: ${e.exit}`;

describe('sorties d’acquittement Socket.IO — toute sortie rend le rappel qu’elle a déclaré', () => {
  it('aucune sortie muette au-delà de l’inventaire gelé', () => {
    const found = sweepSilentAckExits(SRC_DIR).map(key).sort();
    expect(found).toEqual([...FROZEN_SILENT_EXITS].map(key).sort());
  });

  it('toute sortie de `call:signal` rend son acquittement', () => {
    const signalExits = sweepSilentAckExits(SRC_DIR).filter((e) =>
      e.handler.includes('CALL_EVENTS.SIGNAL')
    );

    expect(signalExits).toEqual([]);
  });

  /**
   * Une garde NÉGATIVE dont le balayage rend `[]` reste verte — elle
   * n'attesterait alors que sa propre panne. Le balayage prouve donc d'abord
   * qu'il VOIT des portes d'acquittement dans la production.
   */
  it('le balayage atteint bien les portes d’acquittement de la production', () => {
    const found = sweepSilentAckExits(SRC_DIR);

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((e) => e.file.endsWith('.ts'))).toBe(true);
    expect(found.some((e) => e.exit === 'catch')).toBe(true);
  });
});
