/**
 * L'ACCORD HORS RITUEL entre deux comptes de l'équipe (#16642, décision porteur 2026-11-08).
 *
 * Le titre écouté et la position exigent un consentement de l'émetteur, que le rituel du
 * Sang (`bloodRitual.ts`) recueille — et qui exige un vrai lien. Entre deux comptes de
 * l'équipe (ANALYST et au-dessus, décision porteur du 2026-11-10), la loi ouvre ces outils sans lien (#16623) mais
 * « ouvert, si consenti » n'avait aucun chemin pour consentir. Ce module dit si
 * `PUT /relations/:userId/settings` peut ENREGISTRER l'accord de `ownerId` à `otherId`.
 *
 * Deux conditions, toutes deux requises, aucune lue ailleurs :
 * - les DEUX comptes sont des comptes UTILISABLES de l'équipe (`isUsableTeamAccount`) :
 *   sans cela, un utilisateur ordinaire, même au Sang, accorderait
 *   hors rituel ce que le rituel seul recueille ;
 * - la loi (`pairAccessAmong`, `consentOf` accordé) ouvre CHAQUE feature demandée au lecteur
 *   `otherId` face à `ownerId` : blocage, bouclier des mineurs et fermeture de l'équipe sont
 *   jugés par elle, jamais par une comparaison écrite ici.
 *
 * Aucun lien n'est créé. Une lecture qui échoue LÈVE : l'appelant ferme.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationRitualShare } from '@meeshy/shared/types/relation-person-settings';
import { pairAccessAmong, type PairAccessDb } from './pairAccess';
import { withdrawSharesTheLinkDoesNotOpen, type SharesBeyondLinkDb } from './ritualShareWithdrawal';
import {
  nowPlayingDirectionKey,
  refreshNowPlayingBetween,
  type NowPlayingReaderAccess,
  type NowPlayingRelayDeps,
} from '../nowPlaying/nowPlayingRelay';
import { RITUAL_SHARE_FEATURE } from './relationConsent';
import { ACCOUNT_STATE_SELECT, isUsableTeamAccount } from './usableAccount';

export type TeamShareGrantDb = PairAccessDb & Pick<PrismaClient, 'user'>;

const bothUsableTeamAccounts = async (prisma: Pick<PrismaClient, 'user'>, ids: readonly [string, string]): Promise<boolean> => {
  const accounts = await Promise.all(
    ids.map((id) => prisma.user.findUnique({ where: { id }, select: { role: true, ...ACCOUNT_STATE_SELECT } })),
  );
  return accounts.every(isUsableTeamAccount);
};

export async function teamMayGrantShares(
  prisma: TeamShareGrantDb,
  params: { readonly ownerId: string; readonly otherId: string; readonly shares: readonly RelationRitualShare[]; readonly now?: Date },
): Promise<boolean> {
  if (params.shares.length === 0) return true;
  if (!(await bothUsableTeamAccounts(prisma, [params.ownerId, params.otherId]))) return false;
  const features = [...new Set(params.shares.map((share) => RITUAL_SHARE_FEATURE[share]))];
  const verdicts = await Promise.all(
    features.map((feature) =>
      pairAccessAmong(prisma, {
        feature,
        subjectId: params.ownerId,
        otherIds: [params.otherId],
        subjectIs: 'target',
        now: params.now,
        consentOf: () => 'granted',
      }),
    ),
  );
  return verdicts.every((among) => among.get(params.otherId)?.allowed === true);
}

/**
 * La FIN de l'accord hors rituel (#16814) : `userId` a cessé d'être un compte utilisable de
 * l'équipe (rôle retiré, compte désactivé ou supprimé). Ce que lui et ses ex-collègues s'étaient
 * accordé hors rituel s'éteint dans les DEUX sens, daté chez chaque émetteur comme un retrait :
 * sans cela, la loi refusait bien aujourd'hui, mais un lien Sang créé plus tard rendait lisible
 * ce que le rituel n'avait jamais recueilli. Ce que le LIEN réel ouvre survit : les partages du
 * rituel au Sang, la catégorie d'écoute dès Proche. Un compte qui reste de l'équipe ne perd rien.
 * Avec `nowPlaying`, l'écoute qu'un lecteur voyait par cet accord s'efface chez lui tout de suite
 * (`now-playing:cleared`), au lieu d'y rester jusqu'à son expiration (15 min) — revue du 2026-11-13.
 * Une lecture qui échoue LÈVE : l'appelant journalise, et la loi continue de refuser.
 */
export type TeamShareRevocationDb = SharesBeyondLinkDb & Pick<PrismaClient, 'user'>;

export async function revokeTeamSharesOf(
  prisma: TeamShareRevocationDb,
  params: { readonly userId: string; readonly now: Date; readonly nowPlaying?: NowPlayingRelayDeps },
): Promise<void> {
  const account = await prisma.user.findUnique({ where: { id: params.userId }, select: { role: true, ...ACCOUNT_STATE_SELECT } });
  if (isUsableTeamAccount(account)) return;
  const cuts = await withdrawSharesTheLinkDoesNotOpen(prisma, { userId: params.userId, at: params.now });
  const nowPlaying = params.nowPlaying;
  if (!nowPlaying) return;
  const before = new Map<string, NowPlayingReaderAccess>(cuts.map((cut) => [nowPlayingDirectionKey(cut.emitterId, cut.readerId), cut.listening]));
  const pairs = [...new Map(cuts.map((cut) => [[cut.emitterId, cut.readerId].sort().join(':'), cut])).values()];
  for (const cut of pairs) {
    await refreshNowPlayingBetween(nowPlaying, { userA: cut.emitterId, userB: cut.readerId, before });
  }
}
