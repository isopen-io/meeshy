import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { defaultShareLinkDraft, type MyShareLink } from '@/lib/api/links';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { compile, match } from '@/lib/router';

import {
  LinksHeader,
  ShareLinkActions,
  ShareLinkHero,
  ShareLinkInformation,
  ShareLinkRefused,
  ShareLinkRow,
  ShareLinksEmpty,
  ShareLinksFamilyCard,
  ShareLinksStats,
  ShareLinkUsage,
} from './links-parts';
import { ROUTES } from './route-table';
import { ACCESS_RULES, ConversationChoice, LimitsFields, RulesSection } from './share-link-form';

/**
 * « MES LIENS » DESSINÉ (#6361) — miroir `LinksHubView`, `ShareLinksView`,
 * `ShareLinkDetailView` et `CreateShareLinkView` : chaque pièce est rendue
 * sans DOM ni TanStack Query (motif `communities.test.tsx`). Ces témoins
 * prouvent ce qu'aucune capture ne dit : où une pièce MÈNE, ce qu'elle DIT à
 * un lecteur d'écran, et les contrôles qu'elle ne dessine PAS.
 */

const noop = () => undefined;
const plain = (html: string) => html.replace(/\s/gu, ' ');

const link = (overrides: Partial<MyShareLink> = {}): MyShareLink => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: null,
  name: 'Invitation',
  isActive: true,
  currentUses: 3,
  maxUses: null,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
  conversationTitle: 'Équipe déploiement',
  inactiveReason: null,
  description: null,
  policy: null,
  ...overrides,
});

const routeFor = (path: string) => Object.entries(ROUTES).find(([, route]) => match(compile(route.pattern), path) !== null)?.[0];

describe('les adresses', () => {
  test('`/links` est le hub, `/links/share` la liste, `/links/share/new` la création — jamais un lien nommé « new »', () => {
    expect(routeFor('/links')).toBe('links');
    expect(routeFor('/links/share')).toBe('shareLinks');
    expect(routeFor('/links/share/new')).toBe('shareLinkNew');
    expect(routeFor('/links/share/mshy_abc')).toBe('shareLink');
    expect(match(compile(ROUTES.shareLink.pattern), '/links/share/mshy_abc')).toEqual({ link: 'mshy_abc' });
  });
});

describe('le hub', () => {
  test('la carte des liens de partage ouvre la liste, « + » ouvre la création', () => {
    const html = renderToStaticMarkup(<ShareLinksFamilyCard language="fr" />);
    expect(html).toMatch(/<a[^>]*data-links-family-open[^>]*href="\/links\/share"/);
    expect(html).toMatch(/href="\/links\/share\/new"[^>]*aria-label="Créer un lien de partage"|aria-label="Créer un lien de partage"[^>]*href="\/links\/share\/new"/);
  });

  test('aucune famille que le web ne sert pas : ni suivi, ni affiliation, ni communauté', () => {
    const html = renderToStaticMarkup(<ShareLinksFamilyCard language="fr" />);
    expect(html.match(/data-links-family="/g)?.length).toBe(1);
    expect(html).not.toMatch(/suivi|affili|communaut/i);
  });

  test('l’en-tête : un retour NOMMÉ, et « + » seulement quand on le lui donne', () => {
    const bare = renderToStaticMarkup(<LinksHeader language="fr" back="list" backLabel="Revenir aux conversations" title="Mes liens" />);
    expect(bare).toContain('aria-label="Revenir aux conversations"');
    expect(bare).not.toContain('data-links-create');
    const withCreate = renderToStaticMarkup(<LinksHeader language="fr" back="links" backLabel="Revenir" title="Liens de partage" createLabel="Créer un lien de partage" />);
    expect(withCreate).toContain('href="/links/share/new"');
  });
});

describe('la liste', () => {
  test('les trois agrégats, en nombres de la langue', () => {
    const html = plain(renderToStaticMarkup(<ShareLinksStats language="fr" summary={{ totalLinks: 5, activeLinks: 2, totalUses: 1284 }} />));
    expect(html).toContain('1 284');
    expect(html).toContain('Liens');
    expect(html).toContain('Actifs');
    expect(html).toContain('Rejoints');
  });

  test('une ligne mène à SON détail et annonce nom, état, rejoints et conversation', () => {
    const html = renderToStaticMarkup(<ShareLinkRow language="fr" link={link()} copied={false} onCopy={noop} />);
    expect(html).toContain('href="/links/share/mshy_l1"');
    expect(html).toContain('aria-label="Invitation, Actif, 3 rejoints et Équipe déploiement"');
    expect(html).toContain('aria-label="Copier le lien"');
    expect(html).not.toContain('data-share-link-status');
  });

  test('un lien inactif se dit « Inactif » EN TOUTES LETTRES, pas par la seule couleur', () => {
    const html = renderToStaticMarkup(<ShareLinkRow language="fr" link={link({ isActive: false, inactiveReason: 'REVOKED' })} copied={false} onCopy={noop} />);
    expect(html).toMatch(/data-share-link-status[^>]*>· Inactif</);
  });

  test('« copier » devient une coche quand le lien vient d’être copié', () => {
    const idle = renderToStaticMarkup(<ShareLinkRow language="fr" link={link()} copied={false} onCopy={noop} />);
    const done = renderToStaticMarkup(<ShareLinkRow language="fr" link={link()} copied onCopy={noop} />);
    expect(done).not.toEqual(idle);
    expect(done).toContain('var(--color-success)');
  });

  test('une personne qui a rejoint se compte au singulier, dans la langue', async () => {
    await loadInterfaceCatalog('en');
    expect(renderToStaticMarkup(<ShareLinkRow language="en" link={link({ currentUses: 1 })} copied={false} onCopy={noop} />)).toContain('1 joined');
  });

  test('l’état vide offre de créer', () => {
    expect(renderToStaticMarkup(<ShareLinksEmpty language="fr" />)).toContain('href="/links/share/new"');
  });
});

describe('le détail', () => {
  test('un lien actif offre Copier, Partager, Désactiver — et jamais « Supprimer »', () => {
    const html = renderToStaticMarkup(<ShareLinkActions language="fr" link={link()} copied={false} onCopy={noop} onShare={noop} onToggle={noop} />);
    expect(html.match(/data-share-link-action="([a-z]+)"/g)).toEqual(['data-share-link-action="copy"', 'data-share-link-action="share"', 'data-share-link-action="disable"']);
    expect(html).not.toContain('Supprimer');
  });

  test('un lien désactivé à la main offre « Activer »', () => {
    const html = renderToStaticMarkup(<ShareLinkActions language="fr" link={link({ isActive: false, inactiveReason: 'REVOKED' })} copied={false} onCopy={noop} onShare={noop} onToggle={noop} />);
    expect(html).toContain('data-share-link-action="activate"');
  });

  test('une conversation fermée : pas d’« Activer », et la cause se lit', () => {
    const closed = link({ isActive: false, inactiveReason: 'CONVERSATION_CLOSED' });
    const actions = renderToStaticMarkup(<ShareLinkActions language="fr" link={closed} copied={false} onCopy={noop} onShare={noop} onToggle={noop} />);
    expect(actions).not.toMatch(/data-share-link-action="(activate|disable)"/);
    const hero = renderToStaticMarkup(<ShareLinkHero language="fr" link={closed} url="https://meeshy.me/chat/mshy_l1" />);
    expect(hero).toContain('data-share-link-reason');
    expect(hero).toContain('Inactif');
    expect(hero).toContain('https://meeshy.me/chat/mshy_l1');
  });

  test('sans limite, le maximum se lit « ∞ » et s’annonce « Illimité »', () => {
    const unlimited = renderToStaticMarkup(<ShareLinkUsage language="fr" link={link()} />);
    expect(unlimited).toContain('∞');
    expect(unlimited).toContain('Illimité');
    expect(renderToStaticMarkup(<ShareLinkUsage language="fr" link={link({ maxUses: 50 })} />)).not.toContain('∞');
  });

  test('les informations : l’identifiant (ou le linkId), la création, et l’expiration seulement si elle existe', () => {
    const none = renderToStaticMarkup(<ShareLinkInformation language="fr" link={link()} />);
    expect(none).toContain('mshy_l1');
    expect(none).not.toContain('data-share-link-info="expires"');
    expect(renderToStaticMarkup(<ShareLinkInformation language="fr" link={link({ identifier: 'equipe', expiresAt: '2026-12-31T23:00:00.000Z' })} />)).toContain(
      'data-share-link-info="expires"',
    );
  });

  test('le refus ne dit pas si le lien existe, et ramène à la liste', () => {
    const html = renderToStaticMarkup(<ShareLinkRefused language="fr" />);
    expect(html).toContain('Lien introuvable');
    expect(html).toContain('href="/links/share"');
  });
});

describe('la création', () => {
  const switchOf = (html: string, key: string) => html.match(new RegExp(`<button[^>]*data-link-rule="${key}"[^>]*>`))?.[0] ?? '';

  test('par défaut, le pseudonyme est exigé — comme iOS', () => {
    const html = renderToStaticMarkup(
      <RulesSection language="fr" id="acces" title="Accès" subtitle="…" icon={null} rules={ACCESS_RULES} draft={defaultShareLinkDraft(null)} onToggle={noop} />,
    );
    expect(switchOf(html, 'requireNickname')).toContain('aria-checked="true"');
    expect(switchOf(html, 'requireNickname')).not.toContain('disabled');
  });

  test('« compte requis » éteint ET grise pseudonyme, e-mail et naissance : c’est ce qui part', () => {
    const draft = { ...defaultShareLinkDraft(null), requireAccount: true, requireEmail: true };
    const html = renderToStaticMarkup(<RulesSection language="fr" id="acces" title="Accès" subtitle="…" icon={null} rules={ACCESS_RULES} draft={draft} onToggle={noop} />);
    expect(switchOf(html, 'requireAccount')).toContain('aria-checked="true"');
    ['requireNickname', 'requireEmail', 'requireBirthday'].forEach((key) => {
      expect(switchOf(html, key)).toContain('aria-checked="false"');
      expect(switchOf(html, key)).toContain('disabled');
    });
  });

  test('sans conversation choisie, le choix se nomme par sa promesse', () => {
    expect(renderToStaticMarkup(<ConversationChoice language="fr" conversation={null} invalid={false} onOpen={noop} />)).toContain('Choisir un groupe ou une communauté');
  });

  test('le nombre d’utilisations n’apparaît qu’avec la limite, et un refus nomme la borne', () => {
    const base = defaultShareLinkDraft('c-1');
    const off = renderToStaticMarkup(<LimitsFields language="fr" draft={base} maxUsesInvalid={false} onLimitUses={noop} onMaxUses={noop} onExpiration={noop} />);
    expect(off).not.toContain('id="link-max-uses"');
    expect(off).toContain('Illimité');
    const refused = plain(
      renderToStaticMarkup(<LimitsFields language="fr" draft={{ ...base, limitUses: true, maxUses: 0 }} maxUsesInvalid onLimitUses={noop} onMaxUses={noop} onExpiration={noop} />),
    );
    expect(refused).toContain('id="link-max-uses"');
    expect(refused).toContain('10 000');
  });
});
