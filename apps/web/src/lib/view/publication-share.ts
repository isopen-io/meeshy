import type { ShareDestination } from '@/lib/api/social-events-v2-types';
import { findCardPost } from '@/lib/api/card-caches';
import type { FeedPost } from '@/lib/api/feed-pages';
import { recordShareAction } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { openSendSheet, type SendSheetRequest } from '@/lib/send/send-sheet-store';

import { publicationPayloadOf } from './publication-payload';

/**
 * **« PARTAGER » UNE PUBLICATION OUVRE LA FEUILLE D'ENVOI** (#8884, directive
 * porteur 2026-09-30) — la même base que le transfert d'un message : envoyer
 * la publication à une personne, à plusieurs, à un groupe, ou la republier en
 * post, story ou réel, avec un message joint. Le partage SYSTÈME
 * (`partagerLien`, D-48) n'a pas disparu : il est derrière « Plus
 * d'options… », que la feuille ouvre avec l'adresse canonique. Le partage est
 * COMPTÉ (`POST /posts/:id/share`) par `onShared`, une fois qu'il est parti.
 *
 * La carte vient du registre des caisses (`findCardPost`) : le fil, le détail,
 * les signets, un hashtag ou les Réels l'ont déjà peinte, donc l'entrée n'a
 * que l'identifiant à donner. Un lien direct n'a rien dans aucune caisse : la
 * feuille s'ouvre quand même, en POST et sans aperçu — rien n'est inventé.
 *
 * Synchrone et sans réseau : ouvrir la feuille est le geste, pas une requête.
 */
export function openPublicationShare(params: {
  readonly postId: string;
  readonly lookup?: (postId: string) => FeedPost | undefined;
  readonly open?: (request: SendSheetRequest) => void;
  readonly record?: (postId: string) => unknown;
  /** #10502 — le partage parti, et par où. */
  readonly onShared?: (destination: ShareDestination) => void;
}): void {
  const { postId } = params;
  const record = params.record ?? recordShareAction;
  const post = (params.lookup ?? ((id: string) => findCardPost(appQueryClient, id)))(postId);
  const payload = publicationPayloadOf(postId, post);
  (params.open ?? openSendSheet)({
    intent: 'share',
    payload,
    moreOptions: { url: payload.url },
    onShared: (destination) => {
      void record(postId);
      params.onShared?.(destination ?? 'other');
    },
  });
}
