/**
 * LE PARTAGE SANS CONTACT (#19205) — « rien ne part tant que tu n'as pas choisi ».
 *
 * ÉMETTRE : l'émetteur choisit ses offres (vitrine, demande d'ami) ; le serveur range l'aléa du
 * jeton → l'émetteur pour `CONTACT_EXCHANGE_TTL_SECONDS`, et rend le jeton signé.
 *
 * ACCEPTER : dans l'ordre, et chaque refus est LE MÊME (`CONTACT_EXCHANGE_UNAVAILABLE`) —
 *   1. jeton bien formé, bien signé, non échu ;
 *   2. l'émetteur rangé, qui n'est pas le lecteur — lu sans rien consommer ;
 *   3. PRISE atomique de l'aléa (`claim`, un `SET NX EX`) : un jeton ne sert qu'une fois, même
 *      sous deux acceptations simultanées ; la prise précède la lecture des comptes, donc un
 *      jeton refusé plus loin (blocage, compte parti) est consommé aussi ;
 *   4. deux comptes utilisables, aucun blocage dans un sens ni dans l'autre ;
 *   5. la vitrine, si elle était offerte, telle que la fiche publique la sert à ce lecteur
 *      (`vitrine` — sa porte de blocage et sa garde de présence comprises) : refusée, rien ne part ;
 *   6. la demande d'ami, si elle était offerte : de l'émetteur vers le lecteur, sous la préférence
 *      « recevoir des demandes » du lecteur et les gardes du cœur des demandes (`befriend`) ;
 *   7. l'accusé `contact-exchange:received` à la seule room de l'émetteur : ce qui est ARRIVÉ.
 *
 * Le numéro n'est jamais servi ici : aucune loi d'accès ne l'ouvre par ce canal, et la réponse
 * le dit verrouillé (`CONTACT_EXCHANGE_LOCKED`). Rien n'est persisté au-delà de deux minutes
 * hors la demande d'ami, qui a déjà sa purge et son export.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  CONTACT_EXCHANGE_ERROR_CODES,
  CONTACT_EXCHANGE_LOCKED,
  CONTACT_EXCHANGE_TTL_SECONDS,
  contactExchangeIssuePayloadSchema,
  type ContactExchangeAccepted,
  type ContactExchangeErrorCode,
  type ContactExchangeIssued,
  type ContactExchangeOffer,
  type ContactExchangePerson,
  type ContactExchangeReceivedEventData,
} from '@meeshy/shared/types/contact-exchange';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { ACCOUNT_STATE_SELECT, isUsableAccount, type AccountState } from '../relations/usableAccount';
import { decodeContactExchangeToken, encodeContactExchangeToken, newContactExchangeNonce } from './contactExchangeToken';

export type ContactExchangeStore = {
  readonly put: (key: string, value: string, ttlSeconds: number) => Promise<void>;
  readonly read: (key: string) => Promise<string | null>;
  /** Prend la clé pour `ttlSeconds` si elle est libre (atomique) ; `false` si elle est déjà prise. */
  readonly claim: (key: string, ttlSeconds: number) => Promise<boolean>;
};

export type ContactExchangeDeps = {
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  readonly store: ContactExchangeStore;
  /** La vitrine de l'émetteur servie au lecteur par la fiche publique ; `null` quand elle refuse. */
  readonly vitrine: (issuerId: string) => Promise<Record<string, unknown> | null>;
  /** La préférence « recevoir des demandes » du lecteur. */
  readonly acceptsRequests: (readerId: string) => Promise<boolean>;
  /** Envoie la demande de l'émetteur au lecteur par le cœur des demandes ; `false` quand elle ne part pas. */
  readonly befriend: (pair: { readonly issuerId: string; readonly readerId: string }) => Promise<boolean>;
  /** Une panne d'un effet secondaire (la demande) : signalée, jamais propagée — le jeton est déjà consommé. */
  readonly report?: (error: unknown) => void;
};

type Refusal = { readonly success: false; readonly error: string; readonly code: ContactExchangeErrorCode };
export type ContactExchangeIssueResult = { readonly success: true; readonly data: ContactExchangeIssued } | Refusal;
export type ContactExchangeAcceptResult = { readonly success: true; readonly data: ContactExchangeAccepted } | Refusal;

const INVALID: Refusal = { success: false, error: 'Partage illisible', code: CONTACT_EXCHANGE_ERROR_CODES.INVALID };
const UNAVAILABLE: Refusal = { success: false, error: 'Partage indisponible', code: CONTACT_EXCHANGE_ERROR_CODES.UNAVAILABLE };

/** La marge de la prise au-delà de l'échéance : la prise survit au jeton qu'elle garde. */
const CLAIM_MARGIN_SECONDS = 30;

export const contactExchangeIssuerKey = (nonce: string): string => `contact-exchange:issuer:${nonce}`;
export const contactExchangeClaimKey = (nonce: string): string => `contact-exchange:used:${nonce}`;

export async function issueContactExchange(
  deps: ContactExchangeDeps,
  params: { readonly issuerId: string; readonly payload: unknown },
): Promise<ContactExchangeIssueResult> {
  const parsed = contactExchangeIssuePayloadSchema.safeParse(params.payload);
  if (!parsed.success) return INVALID;
  const nonce = newContactExchangeNonce();
  const expiresAt = Math.floor(deps.now() / 1000) + CONTACT_EXCHANGE_TTL_SECONDS;
  await deps.store.put(contactExchangeIssuerKey(nonce), params.issuerId.toLowerCase(), CONTACT_EXCHANGE_TTL_SECONDS);
  return {
    success: true,
    data: {
      token: encodeContactExchangeToken({ nonce, offers: parsed.data.offers, expiresAt }),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      offers: parsed.data.offers,
      locked: CONTACT_EXCHANGE_LOCKED,
    },
  };
}

type PairAccount = ContactExchangePerson & AccountState & { readonly blockedUserIds: readonly string[] };

const PAIR_SELECT = { id: true, username: true, displayName: true, avatar: true, blockedUserIds: true, ...ACCOUNT_STATE_SELECT } as const;

const personOf = (account: PairAccount): ContactExchangePerson => ({
  id: account.id,
  username: account.username,
  displayName: account.displayName ?? null,
  avatar: account.avatar ?? null,
});

const blocks = (account: PairAccount, otherId: string): boolean =>
  (account.blockedUserIds ?? []).some((id) => id.toLowerCase() === otherId.toLowerCase());

/** Les deux comptes de l'échange s'ils sont utilisables et qu'aucun ne bloque l'autre ; sinon `null`. */
async function openPair(prisma: ContactExchangeDeps['prisma'], issuerId: string, readerId: string) {
  const accounts = (await prisma.user.findMany({ where: { id: { in: [issuerId, readerId] } }, select: PAIR_SELECT })) as PairAccount[];
  const find = (id: string) => accounts.find((account) => account.id.toLowerCase() === id);
  const issuer = find(issuerId);
  const reader = find(readerId);
  if (!isUsableAccount(issuer) || !isUsableAccount(reader)) return null;
  if (blocks(issuer, readerId) || blocks(reader, issuerId)) return null;
  return { issuer, reader };
}

/**
 * L'émetteur d'un jeton valide, pris pour la première et dernière fois par un AUTRE que lui ;
 * sinon `null`. Lire l'émetteur ne consomme rien : l'émetteur qui lit son propre jeton (son autre
 * appareil, son propre lien) ne le brûle pas avant que l'autre le reçoive.
 */
async function claimIssuer(deps: ContactExchangeDeps, token: string, readerId: string) {
  const claims = decodeContactExchangeToken(token, deps.now());
  if (!claims) return null;
  const issuerId = (await deps.store.read(contactExchangeIssuerKey(claims.nonce)))?.toLowerCase();
  if (!issuerId || issuerId === readerId) return null;
  if (!(await deps.store.claim(contactExchangeClaimKey(claims.nonce), CONTACT_EXCHANGE_TTL_SECONDS + CLAIM_MARGIN_SECONDS))) return null;
  return { issuerId, offers: claims.offers };
}

async function sendFriendRequest(deps: ContactExchangeDeps, issuerId: string, readerId: string): Promise<boolean> {
  if (!(await deps.acceptsRequests(readerId))) return false;
  try {
    return await deps.befriend({ issuerId, readerId });
  } catch (error) {
    deps.report?.(error);
    return false;
  }
}

function acknowledge(deps: ContactExchangeDeps, issuerId: string, event: ContactExchangeReceivedEventData): void {
  try {
    deps.io?.to(ROOMS.user(issuerId)).emit(SERVER_EVENTS.CONTACT_EXCHANGE_RECEIVED, event);
  } catch {
    /* l'accusé est un confort : l'échange est fait */
  }
}

export async function acceptContactExchange(
  deps: ContactExchangeDeps,
  params: { readonly readerId: string; readonly token: string },
): Promise<ContactExchangeAcceptResult> {
  const readerId = params.readerId.toLowerCase();
  const claimed = await claimIssuer(deps, params.token, readerId);
  if (!claimed) return UNAVAILABLE;
  const pair = await openPair(deps.prisma, claimed.issuerId, readerId);
  if (!pair) return UNAVAILABLE;

  const offers = claimed.offers;
  const profile = offers.includes('vitrine') ? await deps.vitrine(pair.issuer.id) : undefined;
  if (profile === null) return UNAVAILABLE;
  const sent = offers.includes('friendRequest') ? await sendFriendRequest(deps, pair.issuer.id, pair.reader.id) : undefined;

  const received: ContactExchangeOffer[] = offers.filter((offer) => offer === 'vitrine' || sent === true);
  acknowledge(deps, pair.issuer.id, { reader: personOf(pair.reader), received, receivedAt: new Date(deps.now()).toISOString() });
  return {
    success: true,
    data: {
      issuer: personOf(pair.issuer),
      offers,
      ...(profile ? { profile } : {}),
      ...(sent === undefined ? {} : { friendRequest: sent ? 'sent' : 'not-sent' }),
      locked: CONTACT_EXCHANGE_LOCKED,
    },
  };
}
