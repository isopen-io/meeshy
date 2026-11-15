/**
 * **UNE file de remise, pas deux** (#18616).
 *
 * `server.ts` construit la file et DÉCLARE son unicité sur place : « l'instance
 * VIVANTE est celle-ci … donc **la seule dont la tranche MÉMOIRE porte des
 * entrées de message** ». `delivery-queue-registry.ts` le redit. Les deux
 * doc-comments sont à l'endroit exact où l'on irait vérifier, et ils disaient
 * FAUX : `MeeshySocketIOHandler.startMediaPipelines` en construisait une
 * SECONDE, remise aux quatre déclencheurs d'`emitAttachmentUpdated`.
 *
 * ─── Ce qui casse, et ce qui ne casse pas ────────────────────────────────────
 *
 * La tranche **Redis** est partagée : rien n'y casse. La tranche **MÉMOIRE**
 * est PAR INSTANCE. Sur la seconde, aucune des trois méthodes qui la
 * gouvernent n'était jamais appelée :
 *
 * | méthode | qui l'appelle | conséquence sur la seconde instance |
 * |---|---|---|
 * | `drain()` | `_drainPendingMessages`, sur celle du manager | une entrée tombée en mémoire pendant un hoquet Redis n'est **jamais livrée** — le destinataire hors ligne garde définitivement le vocal NON enrichi, exactement la panne qu'`emitAttachmentUpdated` existe pour empêcher |
 * | `purgeMessage()` | les sites de destruction, par le REGISTRE | `'attachment-updated'` est porteur de TEXTE : la transcription d'un message brûlé, à vue unique ou supprimé **survit** dans cette tranche de tas |
 * | `cleanup()` | le job, sur l'instance enregistrée | aucun balayage de TTL |
 *
 * ─── Pourquoi un cliquet d'INSTANCES, en plus de celui des PORTES ────────────
 *
 * `delivery-queue-door-sweep` garde contre un TRANSPORT qui enfile en direct.
 * Il ne PEUT PAS voir ce défaut-ci : la seconde instance passait bien par la
 * porte partagée — elle lui remettait simplement un autre objet. **Un cliquet
 * qui mesure les APPELS ne voit pas une seconde INSTANCE**, et c'est la
 * deuxième fois que ce dépôt l'apprend sur cette file.
 *
 * ─── Ce que ce cliquet NE voit PAS, dit ici plutôt que découvert plus tard ───
 *
 * Il lit une FORME DE TEXTE — `new RedisDeliveryQueue(`. Mesuré à la mutation :
 * une construction INDIRECTE (`new (require('…').RedisDeliveryQueue)(…)`, une
 * fabrique, un alias de la classe) passe sans le faire rougir. Ce n'est pas un
 * oubli qu'on pourrait réparer en élargissant l'expression : un balayage
 * statique ne peut pas suivre une indirection, et prétendre le contraire ferait
 * du cliquet une garantie qu'il ne tient pas.
 *
 * Sa valeur est donc BORNÉE et elle est réelle : il attrape la forme que la
 * régression prend réellement — celle qu'il vient d'attraper, écrite par une
 * main qui construit ce dont elle a besoin. La seconde moitié est
 * `mediaPipelineDeps.test.ts`, qui mesure l'IDENTITÉ de l'objet remis et tombe
 * donc sur n'importe quelle façon d'en fabriquer un autre — à condition que le
 * pipeline passe par cette composition, ce que ce cliquet-ci garde.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC_DIR = join(__dirname, '..', '..');

/**
 * Les constructions ADMISES, chacune par son rôle — jamais « parce qu'elle
 * était là ». Toute autre ligne qui construit la file est le défaut que ce
 * cliquet existe pour attraper.
 */
const ADMISES: ReadonlyArray<{ file: string; raison: string }> = [
  {
    file: 'server.ts',
    raison: "l'instance VIVANTE du processus, enregistrée par `setSharedDeliveryQueue` et injectée au manager",
  },
  {
    file: 'jobs/index.ts',
    raison:
      "le repli d'un job de nettoyage construit SANS file — son client natif est `null`, " +
      'donc sa tranche mémoire reste vide et ne peut rien retenir',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      walk(full, out);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** Les commentaires CITENT la forme fautive pour l'expliquer — c'est leur rôle. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CONSTRUCTION = /new\s+RedisDeliveryQueue\s*\(/;

function constructions(): string[] {
  return walk(SRC_DIR)
    .filter((file) => CONSTRUCTION.test(stripComments(readFileSync(file, 'utf8'))))
    .map((file) => relative(SRC_DIR, file).split(sep).join('/'))
    .sort();
}

describe('la file de remise hors ligne n’a qu’UNE instance vivante (#18616)', () => {
  /**
   * L'inventaire est FIGÉ, et sa valeur est là : la troisième construction
   * devra se justifier par écrit, comme les deux ci-dessus. Un `toEqual` sur
   * l'ensemble nomme l'intruse dans le message d'échec.
   */
  it('n’est construite QUE là où une raison écrite le dit', () => {
    expect(constructions()).toEqual(ADMISES.map((a) => a.file).sort());
  });

  /**
   * Le pipeline MÉDIA est le site exact du défaut : c'est lui qui alimente
   * `emitAttachmentUpdated`, donc lui dont la tranche portait des entrées
   * `'attachment-updated'` que rien ne drainait ni ne purgeait.
   */
  it('n’est PAS construite par le pipeline média — il prend celle du processus', () => {
    expect(constructions()).not.toContain('socketio/MeeshySocketIOHandler.ts');
  });
});
