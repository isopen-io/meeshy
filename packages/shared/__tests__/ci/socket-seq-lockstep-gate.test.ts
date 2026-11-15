// Le cliquet du LOCKSTEP `_seq` (#18602).
//
// `emitWithSeq` écrit un curseur monotone PAR COMPTE, et son doc-comment
// énonce la condition qui le rend sûr : « un client qui n'observe qu'un
// SOUS-ENSEMBLE des events estampillés voit un trou à chaque event non
// observé ». La règle était tenue par de la prose seule — et la prose nommait
// un observateur web (`notification-socketio.singleton.ts`) sorti du dépôt au
// #7668. Ce fichier est l'adresse où elle se vérifie désormais.
//
// Un curseur GLOBAL observé partiellement est pire que pas de curseur : il
// fabrique des trous là où rien n'a été perdu, et chaque faux trou coûte une
// resynchronisation au client qui le croit.

import { describe, expect, it } from 'vitest';

import { CLIENT_PLATFORMS } from './socket-payload-shape/client-event-readers';
import {
  PLATFORMS_WITHOUT_SEQ_CURSOR,
  seqObservationSitesByPlatform,
  seqObservedByPlatform,
  seqStampSites,
  seqStampedEvents,
} from './socket-payload-shape/seq-lockstep';

describe('le curseur `_seq` est observé par chaque client qui en a un', () => {
  it('resolves the event of every emitWithSeq call site', () => {
    // Fail-CLOSED. Un site qu'on n'a pas su lire n'est pas un site sans
    // événement : c'est le seul site dont on ignore ce qu'il estampille, donc
    // le dernier à amnistier. Il se nomme, et le liage se répare.
    const unresolved = seqStampSites().filter((site) => site.event === null);
    expect(unresolved).toEqual([]);
  });

  it('proves the gateway sweep finds the stamping sites at all', () => {
    // Sans cette assertion, un balayage qui ne trouve RIEN passe vert et le
    // cliquet entier devient décoratif — leçon du cycle 107 (un balayage qui
    // cherche un idiome mesure sa popularité, pas une propriété). Les sites
    // d'estampillage existent : les compter est ce qui prouve qu'on les voit.
    expect(seqStampSites().length).toBeGreaterThan(0);
    expect(seqStampedEvents().size).toBeGreaterThan(0);
  });

  it('observes every stamped event on every platform that carries the cursor', () => {
    const stamped = seqStampedEvents();
    const observed = seqObservedByPlatform();
    const holes = CLIENT_PLATFORMS.filter((platform) => !PLATFORMS_WITHOUT_SEQ_CURSOR.has(platform)).flatMap(
      (platform) =>
        [...stamped]
          .filter((event) => !observed.get(platform)?.has(event))
          .map((event) => `${platform} n'observe pas le \`_seq\` de ${event}`),
    );
    expect(holes).toEqual([]);
  });

  it('keeps the inventory free of platforms that have since gained an observer', () => {
    // Le second sens du cliquet. Une plateforme qui gagne son observateur doit
    // SORTIR de l'inventaire : l'y laisser la dispenserait pour toujours de
    // l'assertion précédente, et c'est elle qui porte la règle.
    //
    // Mesuré sur les OCCURRENCES, jamais sur le relevé LIÉ : l'inventaire
    // affirme qu'aucun curseur n'est observé, et un observateur neuf qu'on ne
    // sait pas lier à sa route rendrait cette assertion verte sur la foi d'une
    // limite du liage. Vérifié : sous le relevé lié, le témoin ne tombait pas.
    const sites = seqObservationSitesByPlatform();
    const stale = [...PLATFORMS_WITHOUT_SEQ_CURSOR.keys()].filter((platform) => (sites.get(platform)?.length ?? 0) > 0);
    expect(stale).toEqual([]);
  });

  it('binds every observation site of a platform that is not inventoried', () => {
    // La contrepartie du choix ci-dessus : sur une plateforme qui observe, une
    // occurrence NON liée est un liage à relire, pas un silence. Sans cette
    // assertion, déplacer l'observation hors de la portée du liage retirerait
    // la plateforme de la garde sans que rien ne rougisse.
    const unbound = [...seqObservationSitesByPlatform()]
      .filter(([platform]) => !PLATFORMS_WITHOUT_SEQ_CURSOR.has(platform))
      .flatMap(([platform, sites]) =>
        sites
          .filter((site) => site.event === null)
          .map((site) => `${platform} observe un curseur que le liage ne rattache à aucune route : ${site.file}`),
      );
    expect(unbound).toEqual([]);
  });

  it('names only real client platforms in the inventory, each with its reason', () => {
    for (const [platform, reason] of PLATFORMS_WITHOUT_SEQ_CURSOR) {
      expect(CLIENT_PLATFORMS).toContain(platform);
      // Une raison sans son issue est un constat ; avec elle, c'est un suivi.
      expect(reason).toMatch(/#\d+/);
    }
  });
});
