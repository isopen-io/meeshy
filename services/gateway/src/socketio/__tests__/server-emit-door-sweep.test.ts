/**
 * Le cliquet des portes d'ÉMISSION — inventaire VIDE.
 *
 * Le cycle 103 a gouverné la CHARGE de `broadcastMessageMutation`. Il a laissé
 * ce suivi, mot pour mot :
 *
 * > `PreviewEmitIO.emit(event: string, payload: unknown)` reste la porte non
 * > typée de toute diffusion d'aperçu. Ce lot a gouverné la CHARGE ;
 * > l'ÉMISSION n'est toujours pas vérifiée contre `ServerToClientEvents`.
 *
 * Elle n'était pas UNE porte : il y en avait **huit**, écrites à la main dans
 * les mêmes termes, sans lien entre elles ni avec le contrat. Les huit sont
 * dérivées de `ServerToClientEvents` depuis le cycle 104 (`socketio/serverEmit.ts`).
 *
 * **Deux cliquets, et aucun ne subsume l'autre** :
 *
 * - celui du TYPE vit dans `serverEmit.ts` (`ServerEmitRatchet`) et garde ce que
 *   la porte REFUSE — un couple dépareillé, un nom d'événement union, la vieille
 *   forme `(string, unknown)`. Il tombe à la compilation si la porte se relâche ;
 * - celui-ci garde qu'il n'y ait pas de NEUVIÈME porte. Une porte relâchée et une
 *   porte contournée sont deux régressions distinctes, et la seconde est la plus
 *   probable : rien n'oblige un nouvel émetteur à importer `serverEmit.ts`, et les
 *   huit copies existantes prouvent qu'on la réécrit spontanément.
 *
 * **Quand ce témoin tombe** : une porte NEUVE vient d'entrer. La réparation est
 * de la remplacer par `ServerEmitIO` / `ServerEmitTarget` / `ServerEmitSocket`,
 * jamais de l'ajouter à un inventaire gelé — il n'y a pas de porte non typée
 * légitime à porter, la forme juste étant toujours la même dérivation.
 *
 * L'inventaire est clé par FICHIER + DÉCLARATION, jamais par numéro de ligne :
 * une clé de ligne dérive à la première édition et transforme le cliquet en
 * bruit (règle du cycle 87 bis).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepUntypedEmitDoors } from './server-emit-door-sweep';

const SRC_DIR = join(__dirname, '..', '..');

describe('portes d’émission Socket.IO — dérivées du contrat, jamais redéclarées', () => {
  it('aucune porte `emit(event: string, …)` écrite à la main dans la production', () => {
    expect(sweepUntypedEmitDoors(SRC_DIR)).toEqual([]);
  });

  /**
   * Le balayage lui-même est une AFFIRMATION, et se vérifie comme telle
   * (cycle 93 : un compte ne s'hérite pas, il se compte). Un balayage qui ne
   * trouve jamais rien rend un inventaire vide pour la mauvaise raison, et
   * c'est indiscernable du succès.
   */
  it('le balayage VOIT la forme qu’il prétend interdire', () => {
    const doors = sweepUntypedEmitDoors(join(__dirname, 'fixtures', 'untyped-emit-door'));

    // Trois formes fautives dans la fixture : la méthode abrégée avec `to(room)`,
    // la même vers un socket tenu, et — depuis le cycle 105 — la porte ouverte
    // par ASSERTION DE TYPE, en propriété-flèche.
    expect(doors.map((d) => d.file)).toEqual(['door.ts', 'door.ts', 'door.ts']);
    expect(doors[0].declaration).toContain('emit(event: string');
    expect(doors[2].declaration).toContain('emit: (event: string');
  });

  /**
   * Et il ne prend pas la forme JUSTE pour la fautive — sans quoi la seule
   * façon de le rendre vert serait de cesser d'émettre.
   */
  it('le balayage ne signale pas les portes dérivées du contrat', () => {
    expect(sweepUntypedEmitDoors(join(__dirname, 'fixtures', 'typed-emit-door'))).toEqual([]);
  });
});
