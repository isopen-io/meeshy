/**
 * Le cliquet des portes de RÉCEPTION — inventaire VIDE.
 *
 * `serverEmit.ts` (cycle 104) gouverne ce que la passerelle ÉMET, et son
 * balayage jumeau garde qu'on n'en réécrive pas une neuvième porte. Sa moitié
 * — ce que la passerelle ÉCOUTE — a été nommée en suivi aux cycles 104, 105 et
 * 106, et reportée à chaque fois. C'est la moitié **hostile** du contrat : ce
 * qu'on émet vient de soi, ce qu'on écoute vient du réseau.
 *
 * Ce qui l'a laissée ouverte n'était pas une déclaration mais un CAST —
 * `this.io as SocketIOServer`, six fois dans `MeeshySocketIOManager`, vers un
 * `Server` SANS générique. Sous `DefaultEventsMap`, les vingt-deux sites
 * d'écoute de `CallEventsHandler` déclaraient chacun la forme de ce qu'ils
 * recevaient, et `call:analytics` a pu être écouté, validé par Zod et agrégé en
 * production **sans figurer nulle part dans `ClientToServerEvents`**, pendant
 * que les trois clients l'émettaient chacun contre sa propre transcription.
 *
 * **Deux cliquets, et aucun ne subsume l'autre** :
 *
 * - celui du TYPE vit dans `clientReceive.ts` (`ClientReceiveRatchet`) et garde
 *   ce que la porte REFUSE. Sa portée est MESURÉE et volontairement modeste : il
 *   attrape un nom d'événement absent du contrat, jamais une charge divergente
 *   mais assignable (la passerelle compile en `strictFunctionTypes: false`, donc
 *   les paramètres se comparent bivariamment) ;
 * - celui-ci garde qu'il n'y ait pas de porte CONTOURNÉE. Une porte relâchée et
 *   une porte contournée sont deux régressions distinctes, et la seconde est la
 *   plus probable : rien n'oblige un nouveau handler à importer `typed-socket`,
 *   et `CallEventsHandler` prouve qu'on écrit spontanément l'autre forme.
 *
 * **Quand ce témoin tombe** : un module de production vient de se mettre à
 * écouter derrière un socket non gouverné. La réparation est d'importer
 * `MeeshySocket` / `MeeshyIOServer` depuis `socketio/typed-socket`, jamais
 * d'ajouter une ligne à un inventaire gelé — il n'y a pas de porte de réception
 * non typée légitime, la forme juste étant toujours la même dérivation.
 *
 * L'inventaire est clé par FICHIER + DÉCLARATION, jamais par numéro de ligne :
 * une clé de ligne dérive à la première édition et transforme le cliquet en
 * bruit (règle du cycle 87 bis).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepUngovernedReceiveDoors } from './client-receive-door-sweep';

const SRC_DIR = join(__dirname, '..', '..');

describe('portes de réception Socket.IO — dérivées du contrat, jamais redéclarées', () => {
  it('aucun module de production n’écoute derrière un `Socket` nu de socket.io', () => {
    expect(sweepUngovernedReceiveDoors(SRC_DIR)).toEqual([]);
  });

  /**
   * Le balayage lui-même est une AFFIRMATION, et se vérifie comme telle
   * (cycle 93 : un compte ne s'hérite pas, il se compte). Un balayage qui ne
   * trouve jamais rien rend un inventaire vide pour la mauvaise raison, et
   * c'est indiscernable du succès.
   */
  it('le balayage VOIT la forme qu’il prétend interdire', () => {
    const doors = sweepUngovernedReceiveDoors(
      join(__dirname, 'fixtures', 'ungoverned-receive-door'),
    );

    expect(doors.map((d) => d.file)).toEqual(['handler.ts']);
    expect(doors[0].declaration).toContain("from 'socket.io'");
  });

  /**
   * Et il ne prend pas la forme JUSTE pour la fautive — sans quoi la seule
   * façon de le rendre vert serait de cesser d'écouter.
   *
   * La fixture porte les DEUX formes légitimes, et la seconde est celle qui
   * décide que l'inventaire peut être vide plutôt qu'exempté : un service qui
   * importe le `Server` nu pour ÉMETTRE seulement n'est pas une porte de
   * réception. Trois modules de la passerelle sont dans ce cas ; les nommer
   * dans une liste d'exemptions aurait produit une liste tenue à la main, en
   * retard par construction.
   */
  it('le balayage ne signale ni le socket dérivé du contrat, ni un émetteur pur', () => {
    expect(
      sweepUngovernedReceiveDoors(join(__dirname, 'fixtures', 'governed-receive-door')),
    ).toEqual([]);
  });
});
