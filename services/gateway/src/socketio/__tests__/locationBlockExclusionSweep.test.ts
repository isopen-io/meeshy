/**
 * Le cliquet : AUCUNE ANNONCE `LOCATION_LIVE_*` n'échappe à l'exclusion de
 * blocage, dans tout `services/gateway/src` (#16745).
 *
 * Quand il tombe, la réparation est de router l'émission par
 * `_fromSocketExcept` — jamais d'ajouter une ligne à un inventaire, ni
 * d'élargir l'exception du balayage. Il n'y a pas d'annonce de position en
 * direct non filtrée qui soit légitime.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { join } from 'node:path';

import {
  ANNOUNCEMENT_EVENTS,
  EXCLUSION_COMPOSER,
  countAnnouncements,
  sweepTree,
  sweepUnguardedAnnouncements,
} from './locationBlockExclusionSweep';

const GATEWAY_SRC = join(__dirname, '..', '..');

describe('le cliquet de l\'exclusion de blocage sur la position en direct', () => {
  it('l\'inventaire des annonces non filtrées est VIDE sur TOUT `src/`', () => {
    expect(sweepTree(GATEWAY_SRC)).toEqual([]);
  });

  /**
   * LE BALAYAGE LIT BIEN L'ARBRE QU'IL ANNONCE. Un cliquet négatif dont le
   * chemin a dérivé rend `[]` pour la seule raison qu'il ne lit rien — et le
   * dépôt a déjà payé un balayage posé sur UN fichier (« la huitième copie
   * vivait dans `utils/socket-broadcast.ts`, à deux répertoires de la
   * septième »).
   */
  it('il trouve bien des annonces à garder dans l\'arbre', () => {
    expect(countAnnouncements(GATEWAY_SRC)).toBeGreaterThanOrEqual(3);
  });

  /**
   * IL TOMBE SUR LES SIX FORMES QUE LA PREMIÈRE VERSION NE VOYAIT PAS, toutes
   * relevées par l'audit adversarial du lot. La première — `const room = …` —
   * est l'idiome DOMINANT du répertoire, que le jumeau de référence emploie :
   * écrit dans le style de la maison, le site non filtré était invisible.
   */
  describe('il TOMBE sur une source fabriquée', () => {
    const fabriquées: ReadonlyArray<readonly [string, string]> = [
      ['la room mise en VARIABLE (l\'idiome du répertoire)',
       'const room = ROOMS.conversation(id);\nthis.io.to(room).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);'],
      ['`.in()`, l\'alias socket.io de `.to()`',
       'this.io.in(ROOMS.conversation(id)).emit(SERVER_EVENTS.LOCATION_LIVE_UPDATED, d);'],
      ['un NOUVEAU helper qui enveloppe la room',
       'this._roomAll(ROOMS.conversation(id)).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);'],
      ['le nom d\'événement mis en CONSTANTE',
       'const ev = SERVER_EVENTS.LOCATION_LIVE_STARTED;\nio.to(ROOMS.conversation(id)).emit(ev, d);'],
      ['un opérateur intercalé (`volatile`, plausible sur un flux GPS)',
       'this.io.to(ROOMS.conversation(id)).volatile.emit(SERVER_EVENTS.LOCATION_LIVE_UPDATED, d);'],
      ['un `.except()` posé À LA MAIN — il doit venir du composeur',
       'socket.to(ROOMS.conversation(id)).except(someList).emit(SERVER_EVENTS.LOCATION_LIVE_UPDATED, d);'],
      ['la diffusion NUE depuis le socket du partageur',
       'socket.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);'],
    ];

    it.each(fabriquées)('%s', (_titre, source) => {
      expect(sweepUnguardedAnnouncements(source)).toHaveLength(1);
    });
  });

  /**
   * ET IL NE TOMBE PAS SUR CE QU'IL NE VISE PAS. Sans ces témoins, resserrer le
   * relevé pour écarter un faux positif passerait inaperçu.
   */
  describe('il laisse passer ce qu\'il ne vise pas', () => {
    it(`une annonce routée par ${EXCLUSION_COMPOSER}`, () => {
      const source = `this.${EXCLUSION_COMPOSER}(socket, ROOMS.conversation(id), hidden).emit(SERVER_EVENTS.${ANNOUNCEMENT_EVENTS[0]}, d);`;
      expect(sweepUnguardedAnnouncements(source)).toEqual([]);
    });

    it('une émission à UN socket nommé — le rattrapage', () => {
      expect(sweepUnguardedAnnouncements('socket.emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);')).toEqual([]);
    });

    it('une RÉTRACTATION, qui ne se filtre pas par décision', () => {
      const source = 'this.io.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.LOCATION_LIVE_STOPPED, d);';
      expect(sweepUnguardedAnnouncements(source)).toEqual([]);
    });

    it('une diffusion de salon d\'une AUTRE famille', () => {
      const source = 'socket.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.MESSAGE_NEW, d);';
      expect(sweepUnguardedAnnouncements(source)).toEqual([]);
    });

    it('une diffusion NUE citée dans un COMMENTAIRE ne compte pas', () => {
      const source = [
        '// socket.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);',
        `this.${EXCLUSION_COMPOSER}(socket, ROOMS.conversation(id), hidden).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);`,
      ].join('\n');
      expect(sweepUnguardedAnnouncements(source)).toEqual([]);
    });
  });

  it('le rouge NOMME le fichier et la forme, pas seulement une ligne', () => {
    const [finding] = sweepUnguardedAnnouncements(
      'const room = ROOMS.conversation(id);\nthis.io.to(room).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);',
      'handlers/Fabriqué.ts'
    );
    expect(finding.file).toBe('handlers/Fabriqué.ts');
    expect(finding.line).toBe(2);
    expect(finding.chain).toContain('to(room)');
  });
});
