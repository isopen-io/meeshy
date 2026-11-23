/**
 * Le CLIQUET de l'inventaire des sites qui adressent la room d'un post
 * (#20430). Voir `post-room-separation-sweep.ts` pour la taxonomie et ses
 * limites — en particulier ce qu'il ne prouve PAS.
 *
 * **Quand il tombe :** un site EN TROP est un site neuf, à déclarer avec sa
 * nature (et, si c'est une exemption, avec sa raison écrite). Un site EN MOINS
 * est un site retiré, et retirer sa ligne fait partie du correctif. La
 * réparation d'une `exemption-motivee` neuve n'est jamais « ajouter une ligne » :
 * c'est répondre à la question « cette charge porte-t-elle du CONTENU ? ».
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import {
  POST_ROOM_SITES,
  NOTHING_TO_SILENCE_CALLERS,
  sweepPostRoomFiles,
  sweepNothingToSilenceCallers,
} from './post-room-separation-sweep';

describe('#20430 — tout site qui adresse la room d’un post déclare sa nature', () => {
  it('le balayage voit quelque chose — un relevé qui rend [] resterait vert à tort', () => {
    expect(sweepPostRoomFiles().length).toBeGreaterThanOrEqual(5);
  });

  it('aucun site NEUF : tout fichier relevé est déclaré dans l’inventaire', () => {
    const declares = new Set(POST_ROOM_SITES.map((site) => site.file));
    expect(sweepPostRoomFiles().filter((file) => !declares.has(file))).toEqual([]);
  });

  it('aucun site MORT : tout fichier déclaré cite encore la room', () => {
    const releves = new Set(sweepPostRoomFiles());
    expect(POST_ROOM_SITES.filter((site) => !releves.has(site.file)).map((s) => s.file)).toEqual([]);
  });

  it('toute nature AUTRE qu’une émission gouvernée porte une RAISON écrite', () => {
    const muets = POST_ROOM_SITES
      .filter((site) => site.kind !== 'emission-gouvernee')
      .filter((site) => (site.raison ?? '').trim().length < 40);
    expect(muets.map((s) => s.file)).toEqual([]);
  });

  it('les appelants de NOTHING_TO_SILENCE sont exactement ceux dont la raison est écrite', () => {
    const declares = new Set(NOTHING_TO_SILENCE_CALLERS.map((c) => c.event));
    const releves = sweepNothingToSilenceCallers();
    expect(releves.filter((event) => !declares.has(event))).toEqual([]);
    expect(NOTHING_TO_SILENCE_CALLERS.filter((c) => !releves.includes(c.event)).map((c) => c.event)).toEqual([]);
  });

  it('chaque exemption de NOTHING_TO_SILENCE dit POURQUOI sa charge ne porte aucun contenu', () => {
    for (const caller of NOTHING_TO_SILENCE_CALLERS) {
      expect(caller.raison.trim().length).toBeGreaterThan(60);
    }
  });
});
