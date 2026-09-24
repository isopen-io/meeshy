import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CommunityConversation, CommunitySummary } from '@/lib/api/communities';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { compile, match } from '@/lib/router';

import {
  CommunitiesEmpty,
  CommunitiesHeader,
  CommunitiesLoadError,
  CommunitiesSearchEmpty,
  CommunityCard,
  CommunityConversationRow,
  CommunityHero,
  CommunityPreviewCard,
  CommunityRefused,
  CommunityStats,
  PrivacyToggle,
  SubmitButton,
} from './communities-parts';
import { ROUTES } from './route-table';

/**
 * LES COMMUNAUTÉS DESSINÉES (#6364) — miroir `CommunityListView`,
 * `CommunityDetailView` et `CommunityCreateView` : chaque pièce est rendue sans
 * DOM ni TanStack Query (motif `profile.test.tsx`). Ces témoins prouvent ce
 * qu'aucune capture ne dit : où une pièce MÈNE, ce qu'elle ANNONCE à un
 * lecteur d'écran, et ce qu'elle ne montre pas.
 */

const noop = () => undefined;

const community = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'm-polyglottes',
  identifier: 'mshy_polyglottes',
  name: 'Les polyglottes',
  description: 'Échanges du jeudi soir',
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: 'u1',
  memberCount: 1284,
  conversationCount: 1,
  ...overrides,
});

const conversation = (overrides: Partial<CommunityConversation> = {}): CommunityConversation => ({
  id: 'c-general',
  identifier: 'general',
  title: 'Général',
  type: 'community',
  avatar: null,
  memberCount: 1,
  lastMessageAt: null,
  ...overrides,
});

const plain = (html: string) => html.replace(/\s/gu, ' ');

describe('les adresses', () => {
  test('`/communities/new` ouvre la création, jamais une communauté nommée « new »', () => {
    const entries = Object.entries(ROUTES);
    const first = entries.find(([, route]) => match(compile(route.pattern), '/communities/new') !== null);
    expect(first?.[0]).toBe('communityNew');
    expect(match(compile(ROUTES.community.pattern), '/communities/mshy_club')).toEqual({ community: 'mshy_club' });
  });
});

describe('la liste', () => {
  test('l’en-tête : un retour NOMMÉ, le titre, et « + » mène à la création', () => {
    const html = renderToStaticMarkup(<CommunitiesHeader language="fr" />);
    expect(html).toContain('aria-label="Revenir aux conversations"');
    expect(html).toContain('Communautés');
    expect(html).toMatch(/href="\/communities\/new"[^>]*aria-label="Créer une communauté"|aria-label="Créer une communauté"[^>]*href="\/communities\/new"/);
  });

  test('une carte est un LIEN vers son détail et dit sa confidentialité et ses compteurs, dans la langue', () => {
    const html = plain(renderToStaticMarkup(<CommunityCard language="fr" community={community()} />));
    expect(html).toContain('href="/communities/m-polyglottes"');
    expect(html).toContain('Les polyglottes');
    expect(html).toContain('Échanges du jeudi soir');
    expect(html).toContain('Publique');
    expect(html).toContain('1,3 k membres');
    expect(html).toContain('1 conversation<');
  });

  test('une communauté privée sans description : le cadenas, et aucun sous-titre inventé', async () => {
    await loadInterfaceCatalog('en');
    const html = renderToStaticMarkup(<CommunityCard language="en" community={community({ isPrivate: true, description: null, memberCount: 1 })} />);
    expect(html).toContain('Private');
    expect(html).toContain('1 member<');
    expect(html).not.toContain('data-community-description');
  });

  test('l’état vide offre de créer ; une recherche vide nomme ce qu’elle cherchait', () => {
    expect(renderToStaticMarkup(<CommunitiesEmpty language="fr" />)).toContain('href="/communities/new"');
    expect(renderToStaticMarkup(<CommunitiesSearchEmpty language="fr" query="xyz" />)).toContain('« xyz »');
  });

  test('une erreur de chargement offre de réessayer', () => {
    const html = renderToStaticMarkup(<CommunitiesLoadError language="fr" title="community.error.title" onRetry={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Réessayer');
  });
});

describe('le détail', () => {
  test('le titre et la confidentialité se LISENT, en toutes lettres', () => {
    const html = renderToStaticMarkup(<CommunityHero language="fr" community={community({ isPrivate: true })} />);
    expect(html).toContain('<h1');
    expect(html).toContain('Les polyglottes');
    expect(html).toContain('Privée');
  });

  /**
   * BANNIÈRE ET AVATAR SONT DES RÉFÉRENCES DE MÉDIA (#6388) — `Community.banner`
   * et `Community.avatar` portent la clé de stockage (#4324) ou l'adresse
   * héritée d'avant la migration 013 ; ni l'une ni l'autre ne charge posée telle
   * quelle en `src`. Même défaut que la vignette des notifications, sur l'écran
   * voisin : la règle vit dans `attachmentSrc`, jamais chez l'appelant.
   */
  test('la bannière et l’avatar passent par la route de flux de la passerelle', () => {
    const html = renderToStaticMarkup(
      <CommunityHero language="fr" community={community({ banner: '2026/09/6aa607/banner.jpg', avatar: 'https://gate.meeshy.me/2026/09/6aa607/harbor_41.png' })} />,
    );
    expect(html).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fbanner.jpg"');
    expect(html).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fharbor_41.png"');
  });

  test('les compteurs sont des nombres ENTIERS, dans la langue', () => {
    const html = plain(renderToStaticMarkup(<CommunityStats language="fr" community={community()} />));
    expect(html).toContain('1 284');
    expect(html).toContain('Membres');
    expect(html).toContain('Conversations');
  });

  test('une conversation ouvre son fil ; sans titre elle se nomme par son identifiant', () => {
    expect(renderToStaticMarkup(<CommunityConversationRow language="fr" conversation={conversation()} />)).toContain('href="/c/c-general"');
    expect(renderToStaticMarkup(<CommunityConversationRow language="fr" conversation={conversation({ title: null })} />)).toContain('general');
  });

  test('le refus ne dit pas si la communauté existe, et ramène à la liste', () => {
    const html = renderToStaticMarkup(<CommunityRefused language="fr" />);
    expect(html).toContain('Communauté introuvable');
    expect(html).toContain('href="/communities"');
  });

  test('aucun geste que le web ne sert : ni membres, ni inviter, ni réglages, ni quitter', () => {
    const html = renderToStaticMarkup(
      <>
        <CommunityHero language="fr" community={community()} />
        <CommunityStats language="fr" community={community()} />
      </>,
    );
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/Inviter|Quitter|Réglages/);
  });
});

describe('la création', () => {
  test('l’aperçu porte le nom tapé, ou sa promesse', () => {
    expect(renderToStaticMarkup(<CommunityPreviewCard language="fr" draft={{ name: '', identifier: '', description: '', isPrivate: true }} />)).toContain('Ma communauté');
    expect(renderToStaticMarkup(<CommunityPreviewCard language="fr" draft={{ name: 'Club', identifier: '', description: '', isPrivate: false }} />)).toContain('Publique');
  });

  test('la bascule de confidentialité est un interrupteur NOMMÉ dont l’effet se lit sous lui', () => {
    const html = renderToStaticMarkup(<PrivacyToggle language="fr" isPrivate onToggle={noop} />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Seuls les membres invités peuvent rejoindre');
  });

  test('le bouton dit qu’il travaille, et se désactive', () => {
    const html = renderToStaticMarkup(<SubmitButton language="fr" submitting disabled />);
    expect(html).toContain('Création…');
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
