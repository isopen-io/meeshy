import * as z from 'zod/mini';
import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';
import type { WorldParticipantCard } from '@meeshy/shared/types/world-participant-card';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **LA FICHE D'UN PARTICIPANT DE WORLD WIDE** (#10102, partie web) —
 * `world.participantsByParticipantId`, ce que l'ÉQUIPE (rôle de
 * plateforme au-delà de USER) lit d'une personne entrée dans World Wide pour
 * la modérer : nom, compte ou anonyme, langues, pays, navigateur, appareil,
 * date d'entrée, lien, rôle. `participantId` est le `senderId` du message.
 *
 * ## UNE DONNÉE PERSONNELLE NE TOUCHE PAS LE DISQUE
 *
 * La passerelle la sert en `private, no-store` et trace chaque lecture au
 * journal d'audit. Montrer n'oblige pas à garder, et ce port tient les deux
 * seaux que le web écrit sur le poste :
 *
 *  - la clé descend d'`ADMIN_SOUVERAIN_PREFIXE`, que la déshydratation du
 *    cache de requêtes exclut (`souverain.ts`) — cache-first EN MÉMOIRE, le
 *    temps de la session, jamais au rechargement ; même parti que les sessions
 *    du lecteur (`account-security.ts`) ;
 *  - la route est hors du seau `api` du service worker
 *    (`net/api-runtime-cache.ts`), qui sinon garderait la réponse entière
 *    sept jours.
 *
 * ## LE DÉCODEUR EST UNE JUMELLE
 *
 * `WireCard` est la jumelle `zod/mini` de `worldParticipantCardSchema`
 * (`@meeshy/shared/types/world-participant-card`), que ce module ne charge pas
 * pour ne pas faire entrer `zod` complet dans le chunk de la feuille —
 * `world-participant-card.test.ts` les confronte sur les mêmes charges. Elle
 * ne laisse passer AUCUNE clé que le contrat ne déclare pas.
 *
 * ## AUCUNE BRANCHE `fixtures`
 *
 * Une démonstration montrerait le poste et le pays d'une personne inventée sous
 * l'habit d'une fiche de modération : sous `source: 'fixtures'`, la lecture
 * échoue proprement et la feuille rend son état d'erreur.
 */

export type WorldParticipantCardDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const UNREADABLE_WORLD_PARTICIPANT_CARD = 'UNREADABLE_WORLD_PARTICIPANT_CARD';

export const worldParticipantCardQueryKey = (participantId: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'world', 'participant-card', participantId] as const;

const nullableText = z.nullable(z.string());

const WireClient = z.object({
  browser: nullableText,
  browserVersion: nullableText,
  os: nullableText,
  osVersion: nullableText,
  deviceType: nullableText,
  platform: nullableText,
  appVersion: nullableText,
});

const WireCard = z.object({
  participantId: z.string().check(z.minLength(1)),
  participantType: z.enum(['anonymous', 'user', 'bot']),
  displayName: z.string(),
  /* Le visage (#12571) — absent chez une passerelle plus ancienne : `null`, la fiche reste lisible. */
  avatar: z.optional(nullableText),
  username: nullableText,
  conversationRole: z.string(),
  accountRole: nullableText,
  languages: z.object({
    conversation: z.string(),
    system: nullableText,
    regional: nullableText,
    customDestination: nullableText,
    deviceLocale: nullableText,
  }),
  country: nullableText,
  client: z.nullable(WireClient),
  joinedAt: z.string(),
  shareLink: z.nullable(z.object({ identifier: nullableText, linkId: z.string(), name: nullableText })),
  status: z.enum(['active', 'left', 'banned']),
  accountDetailsWithheld: z.boolean(),
});

export function decodeWorldParticipantCard(raw: unknown): WorldParticipantCard | null {
  const parsed = WireCard.safeParse(raw);
  return parsed.success ? { ...parsed.data, avatar: parsed.data.avatar ?? null } : null;
}

/** Un REFUS (403) : la porte s'est fermée — l'écran ne montre rien, il ne dit pas pourquoi. */
export function isWorldParticipantCardRefusal(failure: ApiFailure): boolean {
  return failure.status === 403;
}

export async function loadWorldParticipantCard(
  params: WorldParticipantCardDeps & { readonly participantId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<WorldParticipantCard>> {
  if (params.source !== 'gateway') {
    return { ok: false, status: 0, error: 'Fiche indisponible en démonstration', code: UNREADABLE_WORLD_PARTICIPANT_CARD };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: worldEndpoints.participantsByParticipantId(params.participantId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const card = decodeWorldParticipantCard(result.data);
  return card === null ? { ok: false, status: 0, error: 'Fiche illisible', code: UNREADABLE_WORLD_PARTICIPANT_CARD } : { ok: true, data: card };
}
