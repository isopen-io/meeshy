/**
 * Le cliquet de la porte d'ENFILAGE — inventaire VIDE.
 *
 * `enqueueForOfflineParticipants` existe parce que l'obligation « atteindre les
 * participants hors ligne » avait été réimplémentée CINQ fois — deux fois dans
 * `MessageHandler`, une sur le manager, une pour les réactions, une pour les
 * réactions de pièce jointe. Sa doc le dit, et conclut : « a new event family is
 * a call rather than a sixth copy ».
 *
 * La sixième existait pourtant, et elle a survécu à tous les lots qui ont
 * gouverné la file (106, 109 bis, 111, 112, 114) : le chemin REST/ZMQ appelait
 * `this.deliveryQueue.enqueue(...)` en direct, avec un
 * `payload as Record<string, unknown>` qui effaçait la corrélation
 * `(eventType, payload)`. Elle est partie au cycle 116.
 *
 * **Ce que ce cliquet garde, et que rien d'autre ne pouvait garder** : le
 * contrat de la file est tenu au TYPE (`QueuedEventVariant`, cliquet dans
 * `queuedEventContract.ts`), mais un type ne garde que ceux qui l'IMPORTENT.
 * Une porte se relâche, une porte se contourne — et rien n'oblige un nouveau
 * transport à passer par l'unité partagée. Les cinq copies prouvent qu'on la
 * réécrit spontanément.
 *
 * **Quand ce témoin tombe** : un appel DIRECT vient d'entrer. La réparation est
 * de passer par `enqueueForOfflineParticipants` (ou l'un de ses relais typés —
 * `enqueueOfflineMessageMutation`, `enqueueOfflineReactionEvent`), jamais
 * d'ajouter une ligne à un inventaire gelé : il n'y a pas d'enfilage direct
 * légitime, la forme juste étant toujours la même délégation.
 *
 * Si un jour une AUTRE file du service porte une méthode `enqueue`, ce balayage
 * la signalera — et c'est le bon comportement : l'entrée demande alors une
 * décision écrite, pas un gel silencieux.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepDirectEnqueueCalls } from './delivery-queue-door-sweep';

const SRC_DIR = join(__dirname, '..', '..');

describe("file de remise hors ligne — un seul enfilage, celui de l'unité partagée", () => {
  it('aucun transport de production n’appelle `enqueue` en direct', () => {
    expect(sweepDirectEnqueueCalls(SRC_DIR)).toEqual([]);
  });

  /**
   * Le balayage est lui-même une AFFIRMATION, et se vérifie comme telle
   * (cycle 93 : un compte se compte, il ne s'hérite pas). Un balayage qui ne
   * trouve jamais rien rend un inventaire vide pour la mauvaise raison — et
   * c'est indiscernable du succès.
   */
  it('le balayage VOIT la forme qu’il prétend interdire', () => {
    const calls = sweepDirectEnqueueCalls(join(__dirname, 'fixtures', 'direct-enqueue-door'));

    expect(calls.map((c) => c.file)).toEqual(['caller.ts']);
    expect(calls[0].call).toContain('deliveryQueue.enqueue(');
  });

  /** Et il ne prend pas la DÉLÉGATION pour un appel direct. */
  it('le balayage ne signale pas un transport qui délègue', () => {
    expect(sweepDirectEnqueueCalls(join(__dirname, 'fixtures', 'delegated-enqueue-door'))).toEqual([]);
  });
});
