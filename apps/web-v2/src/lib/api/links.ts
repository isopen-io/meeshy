import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * LE PORT DES LIENS DE PARTAGE (#5652, bloc D) — `POST /api/v1/links`
 * (`services/gateway/src/routes/links/creation.ts`, `authRequired`). Voir
 * § 3.3 de la spécification pour le corps et les codes.
 *
 * `allowViewHistory: false` est envoyé EXPLICITE (§ 3.3 : le repli `?? false`
 * n'est qu'au gestionnaire, jamais un défaut déclaré côté schéma) — un lien
 * qui ne le pose pas dépendrait d'un comportement du serveur non contractuel.
 */

export type ShareLinkResult = {
  readonly linkId: string;
  readonly conversationId: string;
  readonly shareLink: {
    readonly id: string;
    readonly linkId: string;
    readonly name?: string;
    readonly description?: string;
    readonly expiresAt?: string | null;
    readonly isActive: boolean;
  };
};

export function createShareLink(
  deps: ConversationsDeps,
  conversationId: string,
): Promise<ApiResult<ShareLinkResult>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return Promise.resolve({
      ok: true,
      data: {
        linkId: `mshy_fixture_${conversationId}`,
        conversationId,
        shareLink: { id: `link-${conversationId}`, linkId: `mshy_fixture_${conversationId}`, isActive: true },
      },
    });
  }
  return deps.transport.request<ShareLinkResult>({
    method: 'POST',
    path: '/api/v1/links',
    body: {
      conversationId,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: false,
      requireAccount: false,
      requireNickname: true,
      requireEmail: false,
    },
  });
}

/**
 * L'URL À PARTAGER (§ 3.3) — `${origin}/chat/${linkId}` : la réponse de
 * `POST /links` ne porte pas `identifier` (contrairement au SDK iOS), donc
 * pas de repli à composer ici.
 */
export function shareLinkUrl(origin: string, linkId: string): string {
  return `${origin}/chat/${linkId}`;
}
