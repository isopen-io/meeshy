/**
 * La purge d'un compte se dérive du SCHÉMA, jamais d'une liste recopiée (#4225,
 * décision `decisions/suppression-de-compte-ce-qui-part-ce-qui-reste-anonymise-ce-qui-survit-4225.md` § 0).
 *
 * Deux témoins :
 *  - exhaustivité : tout modèle de `schema.prisma` qui désigne un compte
 *    (`userId`, `authorId`, `senderId`, `creatorId`, `ownerId`, `closedBy`,
 *    `deletedBy`, ou une relation vers `User`) a un verdict déclaré — à
 *    l'inventaire du compte ou à celui du jeu. Un modèle ajouté demain sans
 *    verdict fait tomber la suite ;
 *  - effet : chaque table déclarée EFFACÉE par `purgeAccountIsolatedData`
 *    reçoit bien, du vrai code de purge, une suppression filtrée sur le compte.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, jest } from '@jest/globals';
import { ACCOUNT_PURGE_INVENTORY, accountPurgeVerdictOf, isDirectErasure } from '../../../services/accountPurgeInventory';
import { purgeAccountIsolatedData } from '../../../services/AccountPurgeService';
import { GAME_PURGED_MODELS, GAME_PURGE_EXCEPTIONS } from '../../../services/game/GamePurge';
import { fakeFileStore } from './pack-privacy.fakes';

jest.mock('../../../utils/password-hash', () => ({
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

const USER_ID = '507f1f77bcf86cd799439011';
const ACCOUNT_FIELDS = ['userId', 'authorId', 'senderId', 'creatorId', 'ownerId', 'closedBy', 'deletedBy'];

/**
 * Une référence de compte sans relation Prisma : un `@db.ObjectId` dont le NOM
 * dit un rôle de personne (`recipientId`, `requesterId`, `uploadedBy`,
 * `controlledUserIds`…). Sans cette lecture, un modèle comme `MessageEnvelope`
 * (`recipientUserId`) ou `CallRecording` (`consentedUserIds`) échappait au relevé
 * et n'avait jamais à déclarer de verdict.
 */
const ACCOUNT_ROLE_FIELD =
  /^(?:\w*[uU]serIds?|\w*By|\w*ById|(?:recipient|requester|joiner|observer|observed|inviter|invitee|reviewer|receiver|sender|owner|author|creator|actor|viewer|reporter|moderator|caller|callee|referrer|referred|blocker|blocked|member|other|userLow|userHigh)Ids?)$/;

const lowerFirst =(name: string) => name.charAt(0).toLowerCase() + name.slice(1);

type SchemaModel = { readonly delegate: string; readonly accountFields: readonly string[] };

function schemaModels(): SchemaModel[] {
  const text = readFileSync(resolve(__dirname, '../../../../../../packages/shared/prisma/schema.prisma'), 'utf8');
  return [...text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
    const lines = body!.split('\n').filter((line) => !line.trim().startsWith('//'));
    const named = ACCOUNT_FIELDS.filter((field) => lines.some((line) => new RegExp(`^\\s{2}${field}\\s`).test(line)));
    const related = lines.flatMap((line) => {
      const relation = /^\s{2}\w+\s+User\??\s+@relation\([^)]*fields:\s*\[(\w+)\]/.exec(line);
      return relation ? [relation[1]!] : [];
    });
    const objectIdRoles = lines.flatMap((line) => {
      const field = /^\s{2}(\w+)\s+String(?:\?|\[\])?\s.*@db\.ObjectId/.exec(line);
      return field && ACCOUNT_ROLE_FIELD.test(field[1]!) ? [field[1]!] : [];
    });
    return { delegate: lowerFirst(name!), accountFields: [...new Set([...named, ...related, ...objectIdRoles])] };
  });
}

const MODELS = schemaModels();
const GAME_DECLARED = new Set<string>([...GAME_PURGED_MODELS, ...Object.keys(GAME_PURGE_EXCEPTIONS)]);

describe("l'inventaire de la purge d'un compte (#4225)", () => {
  it('le relevé du schéma trouve bien les modèles qui désignent un compte', () => {
    const delegates = MODELS.filter((model) => model.accountFields.length > 0).map((model) => model.delegate);
    expect(delegates).toEqual(expect.arrayContaining(['userSession', 'message', 'conversationEngagement', 'mention',
      'messageEnvelope', 'contactJoinNotice', 'callRecording', 'agentConfig', 'messageAttachment']));
    expect(delegates.length).toBeGreaterThan(90);
  });

  it('chaque modèle qui désigne un compte a un verdict déclaré : effacer, anonymiser ou conserver', () => {
    const undeclared = MODELS.filter((model) => model.accountFields.length > 0)
      .map((model) => model.delegate)
      .filter((delegate) => !GAME_DECLARED.has(delegate) && !accountPurgeVerdictOf(delegate));
    expect(undeclared).toEqual([]);
  });

  it("l'inventaire ne nomme que des modèles qui existent, et aucun n'y figure deux fois avec le jeu", () => {
    const delegates = new Set(MODELS.map((model) => model.delegate));
    const ghosts = Object.keys(ACCOUNT_PURGE_INVENTORY).filter((delegate) => !delegates.has(delegate));
    const doubled = Object.keys(ACCOUNT_PURGE_INVENTORY).filter((delegate) => GAME_DECLARED.has(delegate));
    expect({ ghosts, doubled }).toEqual({ ghosts: [], doubled: [] });
  });

  it('un verdict « conserver » ou une purge encore à livrer dit sa raison', () => {
    const silent = Object.entries(ACCOUNT_PURGE_INVENTORY)
      .filter(([, verdict]) => ('reason' in verdict || 'pending' in verdict) && ('reason' in verdict ? verdict.reason : verdict.pending).trim().length < 20)
      .map(([delegate]) => delegate);
    expect(silent).toEqual([]);
  });
});

type Call = { readonly delegate: string; readonly method: string; readonly where: unknown };

/** Une base qui répond « vide » à toute lecture et ENREGISTRE chaque écriture. */
function recordingPrisma() {
  const calls: Call[] = [];
  const answer = (method: string): unknown => {
    if (method === 'findMany' || method === 'groupBy') return [];
    if (method === 'findUnique' || method === 'findFirst') return null;
    if (method === 'count') return 0;
    return { count: 0 };
  };
  const delegate = (name: string) =>
    new Proxy({}, {
      get: (_target, method: string) => async (args?: { where?: unknown }) => {
        calls.push({ delegate: name, method, where: args?.where });
        return answer(method);
      },
    });
  const prisma: Record<string, unknown> = new Proxy({}, {
    get: (_target, name: string) => {
      if (name === '$transaction') {
        return async (work: unknown) => (typeof work === 'function' ? work(prisma) : Promise.all(work as Promise<unknown>[]));
      }
      if (name === 'then') return undefined;
      return delegate(name);
    },
  });
  return { prisma, calls };
}

describe('purgeAccountIsolatedData efface ce que l\'inventaire lui attribue (#4225)', () => {
  const direct = Object.entries(ACCOUNT_PURGE_INVENTORY).flatMap(([delegate, verdict]) =>
    isDirectErasure(verdict) ? [{ delegate, fields: verdict.fields }] : [],
  );

  it('chaque table attribuée reçoit une suppression qui vise le compte, par le champ déclaré', async () => {
    const { prisma, calls } = recordingPrisma();
    await purgeAccountIsolatedData(prisma as never, USER_ID, { packFiles: fakeFileStore([]).store });

    const missed = direct.filter(({ delegate, fields }) =>
      !calls.some((call) => {
        if (call.delegate !== delegate || call.method !== 'deleteMany') return false;
        const where = JSON.stringify(call.where ?? {});
        return where.includes(USER_ID) && fields.every((field) => where.includes(`"${field}"`));
      }),
    ).map(({ delegate }) => delegate);
    expect(missed).toEqual([]);
  });

  it('ce que la purge efface sans l\'avoir déclaré est un oubli de l\'inventaire', async () => {
    const { prisma, calls } = recordingPrisma();
    await purgeAccountIsolatedData(prisma as never, USER_ID, { packFiles: fakeFileStore([]).store });

    const declared = new Set(Object.keys(ACCOUNT_PURGE_INVENTORY));
    const schema = new Set(MODELS.filter((model) => model.accountFields.length > 0).map((model) => model.delegate));
    const undeclared = [...new Set(calls.filter((call) => call.method === 'deleteMany').map((call) => call.delegate))]
      .filter((delegate) => schema.has(delegate) && !declared.has(delegate) && !GAME_DECLARED.has(delegate));
    expect(undeclared).toEqual([]);
  });

  it('les tables qui ne désignent que ce compte, oubliées jusqu\'ici, en font partie', () => {
    const forgotten = ['notificationPreference', 'userStats', 'userPreferences', 'userPreference', 'conversationPreference',
      'userConversationPreferences', 'userConversationCategory', 'userCommunityPreferences', 'passwordResetToken',
      'phonePasswordResetToken', 'emailVerificationWatch', 'magicLinkToken', 'passwordHistory', 'userMessageDeletion',
      'messageStar', 'postBookmark', 'postMediaDownload', 'agentGlobalProfile', 'agentUserRole', 'mutationLog',
      'userEventSeq', 'engagementMilestone'];
    expect(forgotten.filter((delegate) => !direct.some((entry) => entry.delegate === delegate))).toEqual([]);
  });
});
