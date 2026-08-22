/**
 * `POST /conversations/:id/new-link` — la charge d'une création de lien de partage.
 *
 * Même famille que le défaut du cycle 88 sur les deux transports d'édition, et
 * même mécanique : le schéma déclarait une clé, la charge en portait trois, et
 * `fast-json-stringify` — `additionalProperties: false` par défaut — a retiré
 * ce qu'il ne trouvait pas déclaré.
 *
 * Ici la déclaration se trompait DEUX fois sur la seule clé qu'elle nommait :
 *
 * ```ts
 * data: { type: 'object', properties: { link: { type: 'object' } } }
 * ```
 *
 * - `link` est une **chaîne** (l'URL d'invitation `${FRONTEND_URL}/chat/:code`),
 *   pas un objet. Sérialisée contre un schéma d'objet, elle sortait `{}`.
 * - `code` et `shareLink` — le code d'invitation et TOUS les réglages du lien
 *   (plafond d'usages, expiration, droits des anonymes, champs requis à
 *   l'entrée) — n'étaient pas déclarés, donc retirés.
 *
 * La réponse servie était `{"success":true,"data":{"link":{}}}` : une création
 * de lien qui réussit et ne rend NI le lien, NI son code, NI ses réglages.
 *
 * Aucun des trois clients n'emprunte cette porte aujourd'hui — web, iOS et
 * Android créent leurs liens par `POST /links`. C'est ce qui a laissé le défaut
 * vivre ; ce n'est pas ce qui le rend acceptable, parce qu'un client qui
 * l'emprunterait demain n'aurait aucun moyen de deviner pourquoi sa réponse est
 * vide.
 *
 * Ce témoin épingle le contrat au niveau où le défaut vit : la sortie
 * sérialisée.
 */

import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { conversationShareLinkResponseSchema } from '../../../routes/conversations/sharing';

/** La charge RÉELLE du gestionnaire (`sharing.ts`, `sendSuccess`). */
function createdLinkPayload(): Record<string, unknown> {
  return {
    success: true,
    data: {
      link: 'https://meeshy.me/chat/mshy-7f3a91',
      code: 'mshy-7f3a91',
      shareLink: {
        id: '507f1f77bcf86cd799439021',
        linkId: 'mshy-7f3a91',
        name: 'Invitation équipe',
        description: 'Lien de la réunion hebdo',
        maxUses: 25,
        expiresAt: '2026-09-22T00:00:00.000Z',
        allowAnonymousMessages: true,
        allowAnonymousFiles: false,
        allowAnonymousImages: true,
        allowViewHistory: false,
        requireNickname: true,
        requireEmail: false,
      },
    },
  };
}

function serialize(payload: unknown): Record<string, any> {
  const stringify = fastJsonStringify(conversationShareLinkResponseSchema as never);
  return JSON.parse(stringify(payload));
}

describe("POST /conversations/:id/new-link — la réponse rend le lien qu'elle vient de créer", () => {
  it("sert l'URL d'invitation comme la CHAÎNE qu'elle est", () => {
    const out = serialize(createdLinkPayload());

    expect(out.data.link).toBe('https://meeshy.me/chat/mshy-7f3a91');
  });

  it("sert le code d'invitation — la seule part rejouable du lien", () => {
    const out = serialize(createdLinkPayload());

    expect(out.data.code).toBe('mshy-7f3a91');
  });

  it('sert les réglages du lien créé, que le créateur vient de choisir', () => {
    const out = serialize(createdLinkPayload());

    expect(out.data.shareLink).toMatchObject({
      id: '507f1f77bcf86cd799439021',
      linkId: 'mshy-7f3a91',
      name: 'Invitation équipe',
      maxUses: 25,
      expiresAt: '2026-09-22T00:00:00.000Z',
    });
  });

  it("sert les droits accordés aux anonymes — un lien qui ne les rend pas n'est pas relisible", () => {
    const out = serialize(createdLinkPayload());

    expect(out.data.shareLink).toMatchObject({
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: false,
      requireNickname: true,
      requireEmail: false,
    });
  });

  it('accepte un lien sans plafond ni expiration sans fabriquer les clés absentes', () => {
    const payload = createdLinkPayload() as any;
    delete payload.data.shareLink.maxUses;
    delete payload.data.shareLink.expiresAt;

    const out = serialize(payload);

    expect(out.data.shareLink.maxUses ?? null).toBeNull();
    expect(out.data.shareLink.expiresAt ?? null).toBeNull();
    expect(out.data.shareLink.linkId).toBe('mshy-7f3a91');
  });

  it("garde l'enveloppe elle-même intacte", () => {
    const out = serialize(createdLinkPayload());

    expect(out.success).toBe(true);
  });
});
