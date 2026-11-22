import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import type { Participant } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';

import { selfSenderOf, viewerParticipationOf } from './self-sender';

/**
 * **LA LIGNE DE PARTICIPATION DU LECTEUR EST UNE LOI, PAS UN `find`** (#20264).
 *
 * `viewer.id` porte un `User.id` pour un compte et un `Participant.id` pour un
 * visiteur de lien — le `CLAUDE.md` de la passerelle l'écrit (« `userId` n'est
 * PAS toujours un `User.id` »). Chercher la ligne sur la seule colonne `userId`
 * ne trouve donc JAMAIS celle d'un visiteur, et une ligne introuvable ne dit
 * pas « aucun droit » : elle dit « je n'ai pas lu » — ce que `Composer` lit
 * « tout est autorisé » (son contrat : « Absent ⇒ tout est autorisé »).
 *
 * Mesuré en livrant #20228 : `thread.tsx` résolvait ainsi les droits du tiroir
 * du composeur, si bien qu'un visiteur à qui l'hôte avait retiré les images, les
 * fichiers ou les vocaux voyait leurs tuiles — et son geste échouait au serveur.
 * `selfSenderOf`, appelé à la ligne SUIVANTE, résolvait déjà les deux colonnes.
 */

const participant = (overrides: Partial<Participant>): Participant => ({
  id: 'p-ligne',
  conversationId: 'c-world',
  type: 'user',
  displayName: 'Ligne',
  role: 'member',
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  isOnline: false,
  joinedAt: new Date('2026-11-21T09:00:00.000Z'),
  ...overrides,
});

const INVITE: Viewer = { id: 'p-invite', handle: null, displayName: 'Recette QA 063842', isAnonymous: true };
const COMPTE: Viewer = { id: 'u-amina', handle: 'amina', displayName: 'Amina Diallo', isAnonymous: false };

const RESTREINT = {
  canSendMessages: true,
  canSendFiles: false,
  canSendImages: false,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: true,
} as const;

describe('#20264 — la ligne de participation du lecteur, les DEUX colonnes', () => {
  test("le visiteur d'un lien est trouvé par son `Participant.id`, et ses droits avec", () => {
    const rows = [participant({}), participant({ id: 'p-invite', type: 'anonymous', displayName: 'ano_RecetteQA063842', permissions: { ...RESTREINT } })];

    const row = viewerParticipationOf({ participants: rows, viewer: INVITE });

    expect(row?.id).toBe('p-invite');
    expect(row?.permissions.canSendImages).toBe(false);
  });

  test('un compte est trouvé par son `userId`, sa ligne telle quelle', () => {
    const own = participant({ id: 'p-amina', userId: 'u-amina' });
    expect(viewerParticipationOf({ participants: [participant({}), own], viewer: COMPTE })).toBe(own);
  });

  /** Une ligne introuvable dit « je n'ai pas lu », jamais « aucun droit » : c'est l'hôte qui décide, et `Composer` ouvre tout. */
  test('sans ligne servie, ou sans identité, rien n’est affirmé', () => {
    expect(viewerParticipationOf({ participants: [participant({})], viewer: INVITE })).toBeUndefined();
    expect(viewerParticipationOf({ participants: undefined, viewer: COMPTE })).toBeUndefined();
    expect(viewerParticipationOf({ participants: [participant({})], viewer: { ...COMPTE, id: null } })).toBeUndefined();
  });

  /**
   * `selfSenderOf` est une PROJECTION de la même loi : la ligne, plus le nom que
   * l'invité a DONNÉ (#10120). Deux résolutions d'identité pour un même lecteur
   * sont exactement ce qui a produit le défaut.
   */
  test("l'auteur d'un envoi en vol est la MÊME ligne, sous le nom donné", () => {
    const rows = [participant({ id: 'p-invite', type: 'anonymous', displayName: 'ano_RecetteQA063842' })];

    const row = viewerParticipationOf({ participants: rows, viewer: INVITE });
    const sender = selfSenderOf({ participants: rows, viewer: INVITE });

    expect(sender?.id).toBe(row?.id);
    expect(sender?.displayName).toBe('Recette QA 063842');
    expect(row?.displayName).toBe('ano_RecetteQA063842');
  });
});

/**
 * LA GARDE DE SOURCE — le défaut n'était pas une loi fausse, c'était un `find`
 * ÉCRIT À LA MAIN à côté de la loi juste. Un témoin de comportement sur la loi
 * ne peut pas l'attraper : il faut interdire la seconde orthographe.
 */
describe('#20264 — le fil ne réécrit pas la résolution', () => {
  /* Le chemin se dérive de l'URL du module, comme `admin-language-guard` : `import.meta.dir` est une API de bun, qu'aucun type ne déclare. */
  const SRC = fileURLToPath(new URL('../../', import.meta.url));
  const thread = readFileSync(join(SRC, 'routes', 'thread.tsx'), 'utf8');

  test('`thread.tsx` passe par la loi, et ne cherche pas la ligne du lecteur à la main', () => {
    expect(thread).toContain('viewerParticipationOf');
    expect(thread).not.toMatch(/participants\.find\(\s*\(\s*p\s*\)\s*=>\s*p\.userId\s*===/);
  });
});
