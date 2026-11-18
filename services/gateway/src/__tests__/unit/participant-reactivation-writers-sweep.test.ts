/**
 * #10436 — inventaire des écritures qui RALLUMENT une participation.
 *
 * Une ligne `Participant` active ET bannie est lue comme vivante par toute
 * lecture `userId + isActive: true` (liste des conversations, envoi REST, push,
 * aperçu socket). La seule façon d'en fabriquer une est une écriture qui pose
 * `isActive: true` sur une ligne existante sans regarder `bannedAt`.
 * `restore-for-me` le faisait.
 *
 * Ce balayage lit chaque `participant.update / updateMany / upsert` de
 * production et rend ceux qui peuvent rallumer une ligne : `isActive: true`
 * écrit en littéral, l'état de réintégration partagé
 * (`REJOIN_PARTICIPANT_STATE`) ou la transition de débannissement
 * (`unban.data`). Chacun est inscrit ci-dessous avec la garde qui l'empêche de
 * rallumer un banni. Une écriture NEUVE fait rougir le test : elle doit dire sa
 * garde avant d'entrer. Les `create` ne sont pas balayés — une ligne neuve n'a
 * pas de `bannedAt`.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import {
  REACTIVATION_MARKERS,
  callBodies,
  nudeWriteBodies,
  productionFiles,
  reactivationSites,
  writtenPart,
  REJOIN_COMMIT_FILE,
} from '../helpers/participant-reactivation-scan';

const SRC = join(__dirname, '..', '..');

type Reactivation = { readonly file: string; readonly marker: string };

const GUARDED: ReadonlyArray<Reactivation & { readonly guard: string }> = [
  {
    // Vivait dans `routes/user-deletions.ts` jusqu'à #16964, qui a extrait le
    // noyau du geste — ce fichier était au seuil de 1000 lignes.
    file: 'routes/conversations/restore-for-me.ts',
    marker: 'isActive: true',
    guard: 'refuse un banni (403 BANNED) et porte unsetOrNull(bannedAt) dans le where (#10436)',
  },
  {
    file: 'routes/conversations/link-admission.ts',
    marker: 'REJOIN_PARTICIPANT_STATE',
    guard: "commitParticipantRejoin porte unsetOrNull(bannedAt) dans le where (#19688) ; resolveConversationEntry refuse déjà 'banned' en amont",
  },
  {
    // #19650 — l'ajout d'un membre vit, partagé par la route et l'appel, dans
    // `services/conversations/memberAdmission.ts`.
    file: 'services/conversations/memberAdmission.ts',
    marker: 'REJOIN_PARTICIPANT_STATE',
    guard: "commitParticipantRejoin porte unsetOrNull(bannedAt) dans le where (#19688) ; resolveConversationEntry rend déjà 'banned' en amont",
  },
  {
    file: 'routes/conversations/sharing-invite.ts',
    marker: 'REJOIN_PARTICIPANT_STATE',
    guard: "commitParticipantRejoin porte unsetOrNull(bannedAt) dans le where (#19688) ; resolveConversationEntry rend déjà 'banned' en amont",
  },
  {
    file: 'routes/conversations/participant-ban-core.ts',
    marker: 'unban.data',
    guard: 'le débannissement remet bannedAt à null dans la même écriture (resolveUnbanWrite)',
  },
];

const MARKERS = REACTIVATION_MARKERS;

const ENTRY_DECIDER: Readonly<Record<string, string>> = {
  'routes/conversations/link-admission.ts': 'services/conversations/linkAdmission.ts',
};

/**
 * #19688 — le scanner vit dans `helpers/participant-reactivation-scan.ts`,
 * partagé avec le cliquet frère (#16964). Il y était recopié, et les deux
 * copies sont devenues aveugles ENSEMBLE le jour où les trois portes de
 * rentrée sont passées par une unité partagée. L'en-tête du helper le mesure.
 */
const sweepReactivations = (): Reactivation[] => reactivationSites(SRC);

const key = (r: Reactivation) => `${r.file} :: ${r.marker}`;

describe('les écritures qui rallument une participation sont toutes inventoriées (#10436)', () => {
  it('le balayage voit bien les écritures de participants (sans quoi il resterait vert à vide)', () => {
    const all = productionFiles(SRC).flatMap((path) => callBodies(readFileSync(path, 'utf8')));
    expect(all.length).toBeGreaterThan(20);
  });

  it('aucune écriture ne rallume une participation sans garde de bannissement déclarée', () => {
    const found = [...new Set(sweepReactivations().map(key))].sort();
    expect(found).toEqual(GUARDED.map(key).sort());
  });

  it('chaque porte de réintégration consulte resolveConversationEntry, qui refuse un banni', () => {
    const rejoiners = GUARDED.filter((entry) => entry.marker === 'REJOIN_PARTICIPANT_STATE');
    rejoiners.forEach(({ file }) => {
      const source = readFileSync(join(SRC, ENTRY_DECIDER[file] ?? file), 'utf8');
      expect({ file, consults: source.includes('resolveConversationEntry(') }).toEqual({ file, consults: true });
    });
  });

  /**
   * #17072 — ce balayage ne posait qu'UNE question : « cette écriture peut-elle
   * rallumer un BANNI ? ». La langue de l'inventaire était *banni*, et
   * `deletedForMe` n'y était pas un mot — si bien qu'il est resté VERT pendant
   * que l'état de rentrée partagé rallumait des lignes en laissant cette
   * colonne posée, fabriquant une appartenance vivante pour le service et
   * absente de `GET /conversations`.
   *
   * La seconde question est donc écrite ici : **une écriture qui rallume
   * efface-t-elle les colonnes de DÉPART qu'elle a le droit d'effacer ?** Elle
   * se répond soit en répandant l'état partagé (dont le verdict par colonne est
   * gardé par `rejoin-clears-departure-columns.test.ts`), soit en nommant la
   * colonne dans sa propre charge.
   *
   * `unban.data` est exempté, et c'est la raison même de son existence : il
   * lève un bannissement, pas un départ ni une suppression pour soi — il n'a
   * aucune raison de toucher `deletedForMe`, et le faire effacerait la
   * suppression personnelle de quelqu'un au passage.
   *
   * > **Un lot ferme une classe dans SA langue.** Devant un inventaire de
   * > sites, demander : *ce que je viens de nommer est-il la propriété, ou
   * > seulement le mot par lequel je l'ai trouvée ?*
   */
  it('une écriture qui rallume efface aussi `deletedForMe` — par l’état partagé ou en le nommant', () => {
    const silent = GUARDED.filter((entry) => entry.marker !== 'unban.data').filter(({ file, marker }) => {
      const written = callBodies(readFileSync(join(SRC, file), 'utf8')).map(writtenPart);
      const reactivations = written.filter((body) => body.includes(marker));
      return !reactivations.every(
        (body) => body.includes('REJOIN_PARTICIPANT_STATE') || body.includes('deletedForMe'),
      );
    });

    expect(silent.map(key)).toEqual([]);
  });

  it('l’état de rentrée partagé est bien le porteur de cet effacement', () => {
    const admission = readFileSync(join(SRC, 'services/conversations/conversationEntryAdmission.ts'), 'utf8');
    expect(admission).toContain('deletedForMe: null');
  });

  it('restore-for-me ne rallume que sous unsetOrNull(bannedAt)', () => {
    const source = readFileSync(join(SRC, 'routes/conversations/restore-for-me.ts'), 'utf8');
    const restore = callBodies(source).filter((body) => writtenPart(body).includes('isActive: true'));
    expect(restore).toHaveLength(1);
    expect(restore[0]).toContain("unsetOrNull('bannedAt')");
  });

  /**
   * #19688 — la TROISIÈME question, et c'est celle que ce balayage posait de
   * la façon la plus rassurante.
   *
   * Il acceptait, comme garde d'une rentrée, que `resolveConversationEntry`
   * refuse un banni EN AMONT. C'est vrai de la LECTURE, et faux de la FENÊTRE :
   * `resolveBanWrite` n'écrit QUE `bannedAt` quand la cible est déjà inactive,
   * si bien qu'un bannissement commis entre la décision et l'écriture laissait
   * celle-ci rallumer `isActive: true` sur une ligne BANNIE. Trois des quatre
   * portes étaient dans ce cas ; la quatrième — `restore-for-me`, gardée par le
   * témoin ci-dessus — portait la garde dans son `where` et DISAIT pourquoi.
   *
   * > **Une garde posée en AMONT d'une écriture garde une LECTURE.** La
   * > question à poser à une rentrée n'est pas « le banni est-il refusé ? »
   * > mais **« l'état que l'écriture POSE est-il encore légitime au moment où
   * > elle commet ? »** — et seule la clause de l'écriture peut y répondre.
   *
   * La garde n'est plus un argument écrit dans un inventaire : elle est dans le
   * `where`, une fois, chez `commitParticipantRejoin`. Toute porte qui écrit
   * `REJOIN_PARTICIPANT_STATE` par un `prisma.participant.update` NU rougit ici
   * — c'est la seule réparation, jamais une ligne d'inventaire.
   */
  it('aucune porte ne commet une rentrée par un update NU — toutes passent par commitParticipantRejoin', () => {
    const nus = productionFiles(SRC)
      .filter((path) => relative(SRC, path) !== REJOIN_COMMIT_FILE)
      .filter((path) =>
        nudeWriteBodies(readFileSync(path, 'utf8'))
          .map(writtenPart)
          .some((written) => written.includes('REJOIN_PARTICIPANT_STATE'))
      )
      .map((path) => relative(SRC, path));

    expect(nus.sort()).toEqual([]);
  });

  it('la rentrée se commet par une unité UNIQUE, qui porte la garde dans son where', () => {
    const writer = readFileSync(join(SRC, 'services/conversations/rejoinParticipantWrite.ts'), 'utf8');
    const rejoiners = GUARDED.filter((entry) => entry.marker === 'REJOIN_PARTICIPANT_STATE');

    expect({
      portes: rejoiners.length,
      appellent: rejoiners.filter(({ file }) =>
        readFileSync(join(SRC, file), 'utf8').includes('commitParticipantRejoin')
      ).length,
      garde: writer.includes("unsetOrNull('bannedAt')"),
      relitLaCause: writer.includes('P2025') && writer.includes('bannedAt: true'),
    }).toEqual({ portes: rejoiners.length, appellent: rejoiners.length, garde: true, relitLaCause: true });
  });
});
