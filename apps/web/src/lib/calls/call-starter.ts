import type { ApiResult } from '@/lib/api/http';

import type { CallMedia } from './call-store';
import type { StartCallRequest } from './engine';

/**
 * **APPELER UNE PERSONNE** (A7, A8, #6454) — miroir de `CallStarter.swift` :
 * le pavé et le profil n'ont pas de conversation sous la main, ils ont une
 * PERSONNE. Le direct s'ouvre d'abord (`POST /api/v1/conversations`, idempotent
 * côté passerelle : un direct existant est RENDU), puis l'appel part dedans.
 *
 * `prime` s'appelle AVANT l'aller-retour : un contexte audio ne démarre que
 * dans le geste, et l'`await` qui suit en sort (`call-actions.ts`).
 *
 * Les dépendances sont passées, jamais importées : ce module ne tire ni le
 * moteur ni le port des conversations — l'écran les lui donne.
 */

export type CallPerson = { readonly id: string; readonly name: string; readonly avatar: string | null };

export type StartCallWithPersonParams = {
  readonly person: CallPerson;
  readonly media: CallMedia;
  readonly prime: () => void;
  readonly openDirect: (participantId: string) => Promise<ApiResult<{ readonly id: string }>>;
  readonly start: (request: StartCallRequest) => void;
};

export type StartCallOutcome = { readonly ok: true; readonly conversationId: string } | { readonly ok: false };

export async function startCallWithPerson(params: StartCallWithPersonParams): Promise<StartCallOutcome> {
  params.prime();
  const opened = await params.openDirect(params.person.id).catch(() => null);
  if (opened === null || !opened.ok) return { ok: false };
  const conversationId = opened.data.id;
  params.start({ conversationId, media: params.media, title: params.person.name, avatar: params.person.avatar, isGroup: false });
  return { ok: true, conversationId };
}
