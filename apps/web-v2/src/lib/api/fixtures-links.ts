import { CONVERSATIONS } from './fixtures';
import type { ApiResult } from './http';
import { SHARE_LINKS_PAGE_SIZE, type CreateShareLinkBody, type MyShareLink, type ShareLinkResult, type ShareLinksPage } from './links';

/**
 * **LES LIENS DU LECTEUR DE RECETTE** (#6361) — servis par le MÊME chemin que
 * la passerelle (`links.ts`, garde `__FIXTURES__ && source === 'fixtures'`),
 * élagués de tout build `VITE_DATA_SOURCE=gateway` (`vite.config.ts §
 * FIXTURE_MODULE`).
 *
 * Cinq liens, et pas un : deux actifs (dont un sans nom, qui se nomme par son
 * identifiant, et un sans limite), un désactivé à la main (« Activer » a un
 * effet), un expiré et un dont la conversation est fermée (« Activer » n'en a
 * pas, la cause se lit). Du plus récent au plus ancien, comme la passerelle.
 * Une création et une (dés)activation sont tenues en mémoire le temps de
 * l'onglet : le gate navigateur les relit au retour sur la liste.
 */

const INITIAL: readonly MyShareLink[] = [
  {
    id: 'link-deploiement',
    linkId: 'mshy_equipe-deploiement_7f3a',
    identifier: 'equipe-deploiement',
    name: 'Invitation de l’équipe',
    isActive: true,
    currentUses: 12,
    maxUses: 50,
    expiresAt: null,
    createdAt: '2026-09-10T09:00:00.000Z',
    conversationTitle: 'Équipe déploiement',
    inactiveReason: null,
  },
  {
    id: 'link-newsletter',
    linkId: 'mshy_newsletter_5c21',
    identifier: 'newsletter-septembre',
    name: 'Newsletter de septembre',
    isActive: false,
    currentUses: 0,
    maxUses: null,
    expiresAt: null,
    createdAt: '2026-09-05T16:20:00.000Z',
    conversationTitle: 'Annonces produit',
    inactiveReason: 'REVOKED',
  },
  {
    id: 'link-annonces',
    linkId: 'mshy_annonces_2b91',
    identifier: 'annonces-produit',
    name: null,
    isActive: true,
    currentUses: 128,
    maxUses: null,
    expiresAt: '2026-12-31T23:00:00.000Z',
    createdAt: '2026-08-02T14:30:00.000Z',
    conversationTitle: 'Annonces produit',
    inactiveReason: null,
  },
  {
    id: 'link-salon',
    linkId: 'mshy_salon-ete_91e2',
    identifier: null,
    name: 'Salon d’été',
    isActive: false,
    currentUses: 4,
    maxUses: null,
    expiresAt: null,
    createdAt: '2026-07-01T08:00:00.000Z',
    conversationTitle: 'Salon d’été',
    inactiveReason: 'CONVERSATION_CLOSED',
  },
  {
    id: 'link-atelier',
    linkId: 'mshy_atelier-juin_c4d0',
    identifier: 'atelier-juin',
    name: 'Atelier de juin',
    isActive: false,
    currentUses: 31,
    maxUses: 40,
    expiresAt: '2026-06-30T18:00:00.000Z',
    createdAt: '2026-05-20T10:00:00.000Z',
    conversationTitle: 'Salle sécurisée',
    inactiveReason: 'LINK_EXPIRED',
  },
];

let store: readonly MyShareLink[] = INITIAL;
let sequence = 0;

export function fixtureShareLinksPage(offset: number): ShareLinksPage {
  const links = store.slice(offset, offset + SHARE_LINKS_PAGE_SIZE);
  return {
    links,
    summary:
      offset === 0
        ? {
            totalLinks: store.length,
            activeLinks: store.filter((link) => link.isActive).length,
            totalUses: store.reduce((sum, link) => sum + link.currentUses, 0),
          }
        : null,
    nextOffset: offset + links.length < store.length ? offset + links.length : null,
  };
}

export function fixtureSetShareLinkActive(linkId: string, isActive: boolean): ApiResult<{ readonly isActive: boolean }> {
  if (!store.some((link) => link.linkId === linkId)) return { ok: false, status: 404, error: 'Lien de partage non trouvé' };
  store = store.map((link) => (link.linkId === linkId ? { ...link, isActive, inactiveReason: isActive ? null : 'REVOKED' } : link));
  return { ok: true, data: { isActive } };
}

export function fixtureCreateShareLink(body: CreateShareLinkBody, now: Date): ApiResult<ShareLinkResult> {
  const conversation = CONVERSATIONS.find((candidate) => candidate.id === body.conversationId);
  if (conversation?.type === 'direct') return { ok: false, status: 403, error: 'Cannot create share links for direct conversations' };
  sequence += 1;
  const linkId = `mshy_recette_${sequence}`;
  const expiresAt = body.expiresAt ?? null;
  const created: MyShareLink = {
    id: `link-recette-${sequence}`,
    linkId,
    identifier: `recette-${sequence}`,
    name: body.name ?? null,
    isActive: true,
    currentUses: 0,
    maxUses: body.maxUses ?? null,
    expiresAt,
    createdAt: now.toISOString(),
    conversationTitle: conversation?.title ?? null,
    inactiveReason: null,
  };
  store = [created, ...store];
  return {
    ok: true,
    data: {
      linkId,
      conversationId: body.conversationId,
      shareLink: { id: created.id, linkId, name: created.name, description: body.description ?? null, expiresAt, isActive: true },
    },
  };
}
