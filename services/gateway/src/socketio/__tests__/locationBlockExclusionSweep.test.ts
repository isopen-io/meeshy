/**
 * Le cliquet : AUCUNE émission `LOCATION_LIVE_*` vers un salon n'échappe à
 * l'exclusion de blocage (#16745).
 *
 * Quand il tombe, la réparation est de router l'émission par `_roomExcept` ou
 * `_fromSocketExcept` — jamais d'ajouter une ligne à un inventaire. Il n'y a pas
 * de diffusion de position en direct non filtrée qui soit légitime.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOM_EMIT_HELPERS, sweepUnguardedRoomEmits } from './locationBlockExclusionSweep';

const HANDLER = join(__dirname, '..', 'handlers', 'LocationHandler.ts');

describe('LocationHandler — le cliquet de l\'exclusion de blocage', () => {
  it('l\'inventaire des diffusions non filtrées est VIDE', () => {
    expect(sweepUnguardedRoomEmits(readFileSync(HANDLER, 'utf8'))).toEqual([]);
  });

  /**
   * UN BALAYAGE NÉGATIF DONT LE RELEVÉ REND TOUJOURS `[]` RESTE VERT. Ces trois
   * sources fabriquées prouvent qu'il TOMBE, et sur les trois formes par
   * lesquelles une émission de salon peut effectivement arriver.
   */
  describe('il TOMBE sur une source fabriquée', () => {
    it('une diffusion NUE depuis le socket du partageur', () => {
      const source = `
        socket.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);
      `;
      expect(sweepUnguardedRoomEmits(source)).toEqual([
        { line: 2, target: 'ROOMS.conversation(id)' },
      ]);
    });

    it('une diffusion NUE depuis le serveur', () => {
      const source = `
        this.io.to(ROOMS.conversation(session.conversationId)).emit(
          SERVER_EVENTS.LOCATION_LIVE_STOPPED,
          eventData
        );
      `;
      expect(sweepUnguardedRoomEmits(source)).toHaveLength(1);
    });

    it('un `.except()` posé à la main NE suffit pas — il doit venir du composeur', () => {
      const source = `
        socket.to(ROOMS.conversation(id)).except(someList).emit(SERVER_EVENTS.LOCATION_LIVE_UPDATED, d);
      `;
      expect(sweepUnguardedRoomEmits(source)).toHaveLength(1);
    });
  });

  /**
   * ET IL NE TOMBE PAS SUR CE QUI N'EST PAS UN SALON. Sans ces témoins, resserrer
   * le relevé pour écarter un faux positif passerait inaperçu.
   */
  describe('il laisse passer ce qu\'il ne vise pas', () => {
    it.each(ROOM_EMIT_HELPERS)('une diffusion routée par %s', helper => {
      const source = `
        this.${helper}(ROOMS.conversation(id), hidden).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);
      `;
      expect(sweepUnguardedRoomEmits(source)).toEqual([]);
    });

    it('une émission à UN socket nommé — le rattrapage', () => {
      const source = `socket.emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);`;
      expect(sweepUnguardedRoomEmits(source)).toEqual([]);
    });

    it('la rétractation CIBLÉE, dont les destinataires SONT les bloqués', () => {
      const source = `
        for (const socketId of this._socketIdsOf(new Set(userIds))) {
          this.io.to(socketId).emit(SERVER_EVENTS.LOCATION_LIVE_STOPPED, eventData);
        }
      `;
      expect(sweepUnguardedRoomEmits(source)).toEqual([]);
    });

    it('une diffusion de salon qui n\'est PAS de la famille position', () => {
      const source = `socket.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.MESSAGE_NEW, d);`;
      expect(sweepUnguardedRoomEmits(source)).toEqual([]);
    });

    it('une diffusion NUE citée dans un COMMENTAIRE ne compte pas', () => {
      const source = `
        // socket.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);
        this._fromSocketExcept(socket, ROOMS.conversation(id), hidden).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, d);
      `;
      expect(sweepUnguardedRoomEmits(source)).toEqual([]);
    });
  });

  /**
   * LE BALAYAGE LIT BIEN LE FICHIER QU'IL ANNONCE. Un cliquet dont le chemin a
   * dérivé rend `[]` pour la seule raison qu'il ne lit rien.
   */
  it('le fichier gardé porte bien des émissions de cette famille', () => {
    const source = readFileSync(HANDLER, 'utf8');
    expect(source.match(/SERVER_EVENTS\.LOCATION_LIVE_/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });
});
