/**
 * Audit de #19080, E1 (#16188) — les portes d'une conversation se recensent
 * par ce qu'elles FONT, pas par la loi qu'elles appellent.
 *
 * La garde de #17117 (`external-conversation-doors-sweep.test.ts`) trouvait
 * une porte à son appel à la loi d'entrée : « restaurer pour moi », qui
 * rallumait un ancien troisième membre dans un tête-à-tête chiffré de bout en
 * bout, ne l'appelait pas, donc n'existait pas pour elle. Ce balayage-ci part
 * de l'EFFET (`memberActivationCensus.ts`) : toute écriture de `Participant`
 * qui peut laisser `isActive` à vrai — appel du délégué, écriture imbriquée
 * par une relation, écriture brute de la collection.
 *
 * Chaque fichier qui en porte figure dans l'inventaire ci-dessous, avec le
 * NOMBRE de ses écritures activantes et, soit la loi qui les juge, soit la
 * raison pour laquelle aucune loi n'a à les juger. L'égalité est exacte dans
 * les deux sens : une écriture activante ajoutée — même dans un fichier déjà
 * inventorié — ou retirée fait rougir la garde, et oblige à relire la porte.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { activatingWritesByFile, participantWritesOf, participantWritesUnder } from './memberActivationCensus';

const SRC = join(__dirname, '../../..');

type EntryLaw = 'newMemberRefusal(' | 'returningMemberRefusalFor(' | 'admitLinkEntry(' | 'nascentPairRefusal(';

type Door =
  | { readonly writes: number; readonly law: EntryLaw; readonly decidedBy?: { readonly file: string; readonly entry: string } }
  | { readonly writes: number; readonly exempt: string };

const DOORS: Readonly<Record<string, Door>> = {
  // #19650 — l'ajout d'un membre, partagé par `POST …/participants` et l'invitation pendant un appel.
  'services/conversations/memberAdmission.ts': { writes: 2, law: 'newMemberRefusal(' },
  'routes/conversations/sharing-invite.ts': { writes: 2, law: 'newMemberRefusal(' },
  'services/messaging/MessagingService.ts': { writes: 1, law: 'newMemberRefusal(' },
  'routes/conversations/link-admission.ts': { writes: 2, law: 'admitLinkEntry(' },
  'routes/conversations/link-admission-guest.ts': {
    writes: 1,
    law: 'admitLinkEntry(',
    decidedBy: { file: 'routes/conversations/link-admission.ts', entry: 'joinAsGuest(' },
  },
  'routes/conversations/restore-for-me.ts': { writes: 1, law: 'returningMemberRefusalFor(' },
  // Deux écritures : le bannissement (`resolveBanWrite`, qui n'active jamais,
  // compté parce que sa donnée est calculée) et la levée, jugée.
  'routes/conversations/participant-ban-core.ts': { writes: 2, law: 'returningMemberRefusalFor(' },
  'routes/conversations/core-lifecycle.ts': { writes: 1, law: 'nascentPairRefusal(' },
  'routes/directory/friend-request-answer.ts': {
    writes: 1,
    exempt: 'fait naître le tête-à-tête des deux amis, avec la paire exactement',
  },
  'routes/links/utils/share-link-mint.ts': {
    writes: 2,
    exempt: 'fait naître une conversation publique avec son créateur : ni tête-à-tête, ni externe',
  },
  'services/calls/callGroupConversation.ts': {
    writes: 1,
    exempt: 'fait naître le groupe d’un appel en tête-à-tête qui s’élargit, avec ses présents et l’invité : ni tête-à-tête, ni externe (#19650)',
  },
  'services/external-conversation/open-external-conversation.ts': {
    writes: 1,
    exempt: 'fait naître la conversation externe avec son seul membre Meeshy',
  },
  'services/InitService.ts': {
    writes: 2,
    exempt: 'peuple, au démarrage, les conversations d’amorce qu’il vient de créer',
  },
  'services/MaintenanceService.ts': {
    writes: 1,
    exempt: 'présence d’un invité (`isOnline`, `lastActiveAt`) ; `updateData` est déclaré deux fois, l’analyse ne le lit donc pas',
  },
  'services/conversations/ensureGlobalConversationMembership.ts': {
    writes: 1,
    exempt: 'la conversation globale (`type: global`) : ni tête-à-tête, ni externe',
  },
  'services/world/worldConversation.ts': {
    writes: 1,
    exempt: 'la conversation du monde (`type: global`) : ni tête-à-tête, ni externe',
  },
};

/** Où chaque loi est DÉFINIE, et ce qu'elle doit appeler pour juger un nouveau membre. */
const LAW_DEFINITIONS: Readonly<Record<EntryLaw, { readonly file: string; readonly definition: string; readonly delegatesTo?: string }>> = {
  'newMemberRefusal(': { file: 'services/conversations/newMemberAdmission.ts', definition: 'export function newMemberRefusal(' },
  'returningMemberRefusalFor(': { file: 'services/conversations/newMemberAdmission.ts', definition: 'export async function returningMemberRefusalFor(' },
  'admitLinkEntry(': {
    file: 'services/conversations/linkAdmission.ts',
    definition: 'export async function admitLinkEntry(',
    delegatesTo: 'newMemberRefusal(',
  },
  'nascentPairRefusal(': { file: 'services/conversations/creationRegime.ts', definition: 'export function nascentPairRefusal(' },
};

const codeOf = (text: string): string =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

function productionFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : productionFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const sources: ReadonlyMap<string, string> = new Map(
  productionFiles(SRC).map((path) => [relative(SRC, path), codeOf(readFileSync(path, 'utf8'))]),
);
const codeAt = (file: string): string => sources.get(file) ?? '';

describe('toute écriture qui rend un membre actif est une porte inventoriée (audit #19080, E1)', () => {
  const census = participantWritesUnder(SRC);

  it('l’inventaire est EXACTEMENT le recensement : fichiers et nombre d’écritures activantes', () => {
    const expected = Object.fromEntries(Object.entries(DOORS).map(([file, door]) => [file, door.writes]));

    expect(activatingWritesByFile(census)).toEqual(expected);
  });

  it('chaque porte jugée appelle sa loi, chez elle ou chez le seul site qui la décide', () => {
    const unjudged = Object.entries(DOORS).flatMap(([file, door]) => {
      if (!('law' in door)) return [];
      const judge = door.decidedBy ? codeAt(door.decidedBy.file) : codeAt(file);
      return judge.includes(door.law) ? [] : [file];
    });

    expect(unjudged).toEqual([]);
  });

  it('une porte décidée ailleurs n’a qu’un appelant, et il juge AVANT d’entrer', () => {
    Object.entries(DOORS).forEach(([file, door]) => {
      if (!('law' in door) || !door.decidedBy) return;
      const { file: decider, entry } = door.decidedBy;
      const callers = [...sources.entries()]
        .filter(([path, code]) => path !== file && code.includes(entry))
        .map(([path]) => path);
      const deciderCode = codeAt(decider);

      expect(callers).toEqual([decider]);
      expect(deciderCode.indexOf(door.law)).toBeGreaterThanOrEqual(0);
      expect(deciderCode.indexOf(door.law)).toBeLessThan(deciderCode.indexOf(entry));
    });
  });

  it('chaque loi est définie là où l’inventaire la cherche, et la loi des liens délègue à la loi d’entrée', () => {
    Object.values(LAW_DEFINITIONS).forEach(({ file, definition, delegatesTo }) => {
      expect(codeAt(file)).toContain(definition);
      if (delegatesTo) expect(codeAt(file)).toContain(delegatesTo);
    });
  });

  it('une exemption dit pourquoi', () => {
    const silent = Object.entries(DOORS).filter(([, door]) => 'exempt' in door && door.exempt.trim().length < 20).map(([file]) => file);

    expect(silent).toEqual([]);
  });
});

describe('le recensement lit l’effet, et compte comme activation ce qu’il ne sait pas lire', () => {
  const verdicts = (text: string) => participantWritesOf('witness.ts', text).map(({ operation, activates }) => ({ operation, activates }));

  it.each([
    ['une création sans isActive (défaut du schéma : true)', 'prisma.participant.create({ data: { conversationId } })', [{ operation: 'create', activates: true }]],
    ['une création inactive', 'prisma.participant.create({ data: { conversationId, isActive: false } })', [{ operation: 'create', activates: false }]],
    ['une mise à jour de rôle', 'tx.participant.update({ where, data: { role: "admin" } })', [{ operation: 'update', activates: false }]],
    ['une réactivation', 'prisma.participant.update({ where, data: { isActive: true, leftAt: null } })', [{ operation: 'update', activates: true }]],
    ['une décomposition inconnue', 'prisma.participant.update({ where, data: { ...rest } })', [{ operation: 'update', activates: true }]],
    ['une donnée calculée', 'prisma.participant.updateMany({ where, data: computeData() })', [{ operation: 'updateMany', activates: true }]],
    ['un argument constant qui désactive', 'const hide = { where, data: { isActive: false } };\nprisma.participant.update(hide)', [{ operation: 'update', activates: false }]],
    ['un argument constant ambigu', 'const d = { isActive: false };\nfunction f() { const d = { isActive: true }; }\nprisma.participant.update({ where, data: d })', [{ operation: 'update', activates: true }]],
    ['une valeur conditionnelle', 'prisma.participant.update({ where, data: { isActive: flag } })', [{ operation: 'update', activates: true }]],
    ['un upsert dont la mise à jour réactive', 'prisma.participant.upsert({ where, create: { isActive: false }, update: { isActive: true } })', [{ operation: 'upsert', activates: true }]],
    ['une naissance imbriquée', 'prisma.conversation.create({ data: { participants: { create: [{ userId }] } } })', [{ operation: 'participants.create', activates: true }]],
    ['une réactivation imbriquée', 'prisma.conversation.update({ data: { participants: { updateMany: { where, data: { isActive: true } } } } })', [{ operation: 'participants.updateMany', activates: true }]],
    ['un rattachement par la relation du compte', 'prisma.user.update({ data: { participations: { connect: { id } } } })', [{ operation: 'participations.connect', activates: true }]],
    ['une écriture brute par commande', 'prisma.$runCommandRaw({ update: "Participant", updates: [] })', [{ operation: 'raw.update', activates: true }]],
    ['une écriture brute par le pilote', 'const rows = db.collection("Participant");\nrows.updateMany({}, { $set: {} })', [{ operation: 'raw.updateMany', activates: true }]],
  ])('%s', (_label, text, expected) => {
    expect(verdicts(text)).toEqual(expected);
  });

  it.each([
    ['une lecture', 'prisma.participant.findMany({ where: { isActive: true } })'],
    ['une projection de la relation', 'prisma.conversation.findUnique({ select: { participants: { select: { id: true } } } })'],
    ['un rattachement singulier depuis un autre modèle', 'prisma.mention.create({ data: { participant: { connect: { id } } } })'],
    ['une lecture brute', 'db.collection("Participant").findOne({})'],
  ])('%s n’est pas une écriture', (_label, text) => {
    expect(verdicts(text)).toEqual([]);
  });
});
