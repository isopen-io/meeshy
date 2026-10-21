import { hashSessionToken } from '../../utils/session-token';
import { isReaderKey, readerKeyOf } from './readerKey';
import { ANONYMOUS_VIEW_TTL_MS } from './anonymousReach';

/**
 * Migration des ouvertures anonymes existantes (#10483, G11).
 *
 * Avant ce lot, `AnonymousPostOpen.sessionKey` gardait la valeur BRUTE de
 * X-Session-Token — pour un invité de lien, son jeton de session, un
 * credential que `Participant` ne garde qu'en hash. La migration :
 *  - remplace chaque clé brute par la clé de lecteur HMAC que la passerelle
 *    calcule désormais (`participant:<id>` si le jeton est celui d'un invité,
 *    `token:<valeur>` sinon) ;
 *  - pose `expiresAt = createdAt + 90 j` ;
 *  - pose l'index TTL sur `expiresAt` (ou rend TTL un index ordinaire).
 *
 * Une ligne SANS `expiresAt` a été écrite par l'ancienne passerelle — la
 * nouvelle le pose toujours, en même temps que la clé hachée, en UNE
 * écriture. C'est ce qui rend la migration idempotente même pour un jeton brut
 * qui aurait la forme d'une clé (64 hex) : rejouée, elle ne trouve plus rien.
 *
 * Deux jetons d'un même invité sur un même post donnent la même clé : la
 * seconde ligne est un DOUBLON du même lecteur, elle est retirée (les
 * compteurs déjà posés ne bougent pas).
 */

export type StoredOpen = {
  readonly id: string;
  readonly postId: string;
  readonly sessionKey: string;
  readonly createdAt: Date;
  readonly expiresAt?: Date | null;
};

export type TtlIndexOutcome = 'created' | 'converted' | 'present';

/**
 * Le nom de l'index TTL — CELUI que `schema.prisma` déclare
 * (`@@index([expiresAt], map: "AnonymousPostOpen_expiresAt_idx")`). Le moteur
 * Prisma MongoDB reconnaît un index par nom et clés, pas par ses options : sous
 * ce nom, un `db push` le voit présent et ne touche pas son TTL.
 */
export const ANONYMOUS_POST_OPEN_TTL_INDEX = 'AnonymousPostOpen_expiresAt_idx';

export type AnonymousPostOpenMigrationStore = {
  /** Les lignes sans `expiresAt` ou dont la clé n'est pas une clé de lecteur. */
  legacyRows(): Promise<readonly StoredOpen[]>;
  /** `duplicate` quand `(postId, sessionKey)` est déjà pris par une autre ligne. */
  rekey(id: string, next: { readonly sessionKey: string; readonly expiresAt: Date }): Promise<'updated' | 'duplicate'>;
  remove(id: string): Promise<void>;
  guestIdByTokenHash(tokenHash: string): Promise<string | undefined>;
  ensureTtlIndex(dryRun: boolean): Promise<TtlIndexOutcome>;
};

export type AnonymousPostOpenMigrationReport = {
  readonly scanned: number;
  readonly rekeyed: number;
  readonly merged: number;
  readonly ttlIndex: TtlIndexOutcome;
};

const needsMigration = (row: StoredOpen): boolean =>
  row.expiresAt === undefined || row.expiresAt === null || !isReaderKey(row.sessionKey);

export async function migrateAnonymousPostOpens(
  store: AnonymousPostOpenMigrationStore,
  options: { readonly secret: string; readonly dryRun?: boolean },
): Promise<AnonymousPostOpenMigrationReport> {
  const dryRun = options.dryRun === true;
  const rows = (await store.legacyRows()).filter(needsMigration);

  let rekeyed = 0;
  let merged = 0;
  for (const row of rows) {
    const participantId = await store.guestIdByTokenHash(hashSessionToken(row.sessionKey));
    const next = {
      sessionKey: readerKeyOf({ sessionToken: row.sessionKey, participantId }, options.secret),
      expiresAt: new Date(row.createdAt.getTime() + ANONYMOUS_VIEW_TTL_MS),
    };
    if (dryRun) {
      rekeyed += 1;
      continue;
    }
    if ((await store.rekey(row.id, next)) === 'updated') {
      rekeyed += 1;
      continue;
    }
    await store.remove(row.id);
    merged += 1;
  }

  const ttlIndex = await store.ensureTtlIndex(dryRun);
  return { scanned: rows.length, rekeyed, merged, ttlIndex };
}
