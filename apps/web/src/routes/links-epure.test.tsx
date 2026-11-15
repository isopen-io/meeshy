import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import type { AffiliateToken } from '@/lib/api/affiliate-tokens';
import type { ShareLinkStats } from '@/lib/api/link-stats';
import type { MyShareLink, ShareLinkPolicy } from '@/lib/api/links';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { loadLinkFamiliesCatalog, translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { controlledBy } from '@/test-support/perceivable-text';

import { AffiliateTokenRow } from './affiliate-links';
import AffiliateLinkNewScreen from './affiliate-link-new';
import { FamilyEmpty } from './link-families-parts';
import LinksScreen from './links';
import { ShareLinksEmpty } from './links-parts';
import MyTrackingLinkNewScreen from './my-tracking-link-new';
import { ArrivalLanguages, ConfigurationCard, RecentArrivals } from './share-link-detail-parts';
import { ACCESS_RULES, PERMISSION_RULES, RulesSection } from './share-link-form';
import ShareLinkNewScreen from './share-link-new';

/**
 * L'ÉPURE DES ÉCRANS DE LIENS (#17595, épure #17584) — chaque entrée se NOMME
 * d'un mot du lexique et rien ne se dit deux fois. Les REPÈRES, eux, restent
 * visibles (règle 7, #17641) : `links-reperes.test.tsx` les tient. Seul le détail
 * SECONDAIRE passe derrière un (i) dont le nom est la QUESTION.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadLinkFamiliesCatalog('fr'), loadInviteCatalog('fr')]);
  ensureHappyDomRegistered({ url: 'http://localhost/links' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

/** Les mots VUS : le texte hors de toute note repliée (`sr-only`), phrase par phrase. */
const seen = (host: ParentNode): string[] => {
  const walker = document.createTreeWalker(host as Node, NodeFilter.SHOW_TEXT);
  const lines: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/gu, ' ').trim();
    if (text === '' || node.parentElement?.closest('.sr-only') != null) continue;
    lines.push(text);
  }
  return lines;
};

const infoButton = (host: ParentNode, question: string): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === question);
  if (button === undefined) throw new Error(`aucun (i) nommé « ${question} »`);
  return button;
};

describe('le hub /links', () => {
  test('aucune bannière : l’en-tête « Mes liens » suffit', async () => {
    const host = await mount(<LinksScreen />);
    const text = seen(host).join(' | ');
    expect(text).not.toContain('Gérez vos liens');
    expect(text).not.toContain('Partagez, suivez');
  });

  test('chaque famille se NOMME par un mot du lexique', async () => {
    const host = await mount(<LinksScreen />);
    expect([...host.querySelectorAll('[data-links-family-title]')].map((title) => title.textContent)).toEqual(['Partage', 'Suivi', 'Communautés', 'Parrainage']);
  });

  test('la création et l’ouverture de chaque famille restent atteintes', async () => {
    const host = await mount(<LinksScreen />);
    expect(host.querySelectorAll('[data-links-family-open]')).toHaveLength(4);
    expect(host.querySelectorAll('[data-links-family-create]')).toHaveLength(3);
  });
});

describe('les états vides', () => {
  test('un titre, une phrase et le bouton — rien de plus', () => {
    const html = renderToStaticMarkup(<ShareLinksEmpty language="fr" />);
    expect(html).toContain('Aucun lien de partage');
    expect(html.match(/<p[ >]/gu)).toHaveLength(2);
    expect(html).toContain('href="/links/share/new"');
    const family = renderToStaticMarkup(
      <FamilyEmpty family="tracking" glyph={null} title="Aucun lien de suivi" subtitle="Créez un lien pour suivre vos clics et vos campagnes" cta={{ to: 'myTrackingLinkNew', label: 'Créer un lien de suivi' }} />,
    );
    expect(family.match(/<p[ >]/gu)).toHaveLength(2);
    expect(family).toContain('href="/links/tracking/new"');
  });
});

const token = (overrides: Partial<AffiliateToken> = {}): AffiliateToken => ({
  id: 't1',
  token: 'abc',
  name: 'Invitation amis',
  isActive: true,
  currentUses: 50,
  maxUses: 50,
  referrals: 50,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
  ...overrides,
});

describe('le parrainage', () => {
  test('avec un plafond, la jauge « 50 sur 50 » reste et « 50 inscrits » s’efface', () => {
    const html = renderToStaticMarkup(<AffiliateTokenRow language="fr" token={token()} copied={false} onCopy={() => undefined} onShare={() => undefined} onDelete={() => undefined} />);
    expect(html).toContain('50 sur 50');
    expect(html).not.toContain('50 inscrits');
  });

  test('sans plafond, le nombre d’inscrits est la seule mesure', () => {
    const html = renderToStaticMarkup(
      <AffiliateTokenRow language="fr" token={token({ maxUses: null, referrals: 3 })} copied={false} onCopy={() => undefined} onShare={() => undefined} onDelete={() => undefined} />,
    );
    expect(html).toContain('3 inscrits');
    expect(html).not.toContain(' sur ');
  });
});

describe('la création d’un lien de partage', () => {
  test('les sections portent le verbe, les rangées sont des noms, aucun sous-titre ne répète son titre', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    const text = seen(host);
    for (const wanted of ['Demander aux invités', 'Autoriser', 'Compte Meeshy', 'Pseudo', 'E-mail', 'Date de naissance', 'Messages', 'Images', 'Fichiers', 'Historique', 'Choisir', 'Description', 'Créer le lien']) {
      expect(text).toContain(wanted);
    }
    const joined = text.join(' | ');
    for (const gone of [
      'Identité du lien',
      'Accès invités',
      'Compte requis',
      'Permissions',
      'Description (facultative)',
      'Choisir un groupe ou une communauté',
      'Créer le lien de partage',
      'Ce que les visiteurs doivent fournir',
      'Le visiteur doit',
    ]) {
      expect(joined).not.toContain(gone);
    }
  });

  test('« Choisir » se lit seul à l’écran, mais le lecteur d’écran entend ce qu’on choisit', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    const choice = host.querySelector('button[aria-haspopup="dialog"]');
    expect(choice?.textContent).toBe('Choisir');
    expect(choice?.getAttribute('aria-label')).toBe('Choisir une conversation');
  });

  test('les huit bascules restent atteintes et nommées par leur mot court', () => {
    const draft = { requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false, allowAnonymousMessages: true, allowAnonymousImages: true, allowAnonymousFiles: false, allowViewHistory: true };
    const html = renderToStaticMarkup(
      <>
        <RulesSection language="fr" id="a" title="Demander aux invités" subtitle={null} icon={null} rules={ACCESS_RULES} draft={draft} onToggle={() => undefined} />
        <RulesSection language="fr" id="p" title="Autoriser" subtitle={null} icon={null} rules={PERMISSION_RULES} draft={draft} onToggle={() => undefined} />
      </>,
    );
    expect(html.match(/role="switch"/gu)).toHaveLength(8);
    for (const name of ['Compte Meeshy', 'Pseudo', 'E-mail', 'Date de naissance', 'Messages', 'Images', 'Fichiers', 'Historique']) {
      expect(html).toContain(`aria-label="${name}"`);
    }
  });
});

describe('la création d’un lien de suivi', () => {
  test('URL, Nom et Jeton se disent une fois', async () => {
    const host = await mount(<MyTrackingLinkNewScreen />);
    const text = seen(host);
    for (const wanted of ['URL', 'Nom', 'Jeton', 'Créer le lien']) expect(text).toContain(wanted);
    const joined = text.join(' | ');
    for (const gone of ['URL de destination', 'Nom interne', 'Jeton personnalisé', 'Jeton (facultatif)', 'Créer le lien de suivi']) {
      expect(joined).not.toContain(gone);
    }
  });

  test('seul le détail secondaire reste derrière un (i) : « Nom » y garde ce que disait « Nom interne »', async () => {
    const host = await mount(<MyTrackingLinkNewScreen />);
    const name = infoButton(host, 'Qui voit ce nom ?');
    expect(controlledBy(name)?.textContent).toBe('Vous seul : il range vos liens, le public ne le voit pas.');
    expect(seen(host).join(' | ')).not.toContain('Vous seul');
    expect(host.querySelector('#tracking-name')?.getAttribute('aria-describedby')).toContain(name.getAttribute('aria-controls') ?? '?');
  });
});

describe('la création d’un lien de parrainage', () => {
  test('« Nom » et « Limiter les inscriptions » s’affichent chacun une seule fois', async () => {
    const host = await mount(<AffiliateLinkNewScreen />);
    const text = seen(host);
    expect(text.filter((line) => line === 'Nom')).toHaveLength(1);
    expect(text.filter((line) => line === 'Limiter les inscriptions')).toHaveLength(1);
    expect(text).toContain('Créer le lien');
  });
});

const POLICY: ShareLinkPolicy = {
  maxConcurrentUsers: 50,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowAnonymousMessages: true,
  allowAnonymousImages: true,
  allowAnonymousFiles: false,
  allowViewHistory: true,
  allowedLanguages: [],
};

const link = (): MyShareLink => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: null,
  name: 'Nova Club',
  isActive: true,
  currentUses: 0,
  maxUses: null,
  expiresAt: null,
  createdAt: '2026-09-02T09:00:00.000Z',
  conversationTitle: 'Équipe',
  inactiveReason: null,
  description: null,
  policy: POLICY,
});

const noArrival: ShareLinkStats = { visits: 0, arrivals: 0, anonymousArrivals: 0, arrivalsByLanguage: [], arrivalsByCountry: [], recentArrivals: [] };

describe('la page d’un lien de partage', () => {
  test('la configuration dit « Autoriser » et les mêmes quatre mots que la création', () => {
    const html = renderToStaticMarkup(<ConfigurationCard language="fr" link={link()} policy={POLICY} />);
    expect(html).toContain('Autoriser');
    for (const word of ['Messages', 'Images', 'Fichiers', 'Historique']) expect(html).toContain(`>${word}<`);
    expect(html).not.toContain('Droits des invités');
    expect(html).not.toContain('Écrire des messages');
  });

  test('sans arrivée, la rubrique « Langues des arrivants » est absente et une seule ligne dit le vide', () => {
    expect(renderToStaticMarkup(<ArrivalLanguages language="fr" stats={noArrival} />)).toBe('');
    const recent = renderToStaticMarkup(<RecentArrivals language="fr" linkId="mshy_l1" stats={noArrival} now={new Date('2026-09-10T10:00:00Z')} />);
    expect(recent).toContain('Aucune arrivée');
    expect(recent).not.toContain('Aucune arrivée pour l’instant.');
  });
});

describe('les mots du détail de suivi', () => {
  test('« Clics » et « Uniques », les mots de la liste', () => {
    expect(translateLinkFamilies('fr', 'linkFamilies.tracking.totalClicks')).toBe('Clics');
    expect(translateLinkFamilies('fr', 'linkFamilies.tracking.uniqueClicks')).toBe('Uniques');
  });
});

describe('les sept langues portent les mots courts, traduits et jamais copiés du français', () => {
  const SHORTENED = ['links.create.button', 'links.create.access.account', 'links.create.section.access', 'links.create.section.permissions', 'links.create.choose', 'links.hub.tracking.title', 'links.hub.community.title', 'links.hub.affiliate.title'] as const;

  test('chaque libellé raccourci est dit autrement que le français dans les six autres langues', async () => {
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadLinkFamiliesCatalog(language)));
    for (const language of SUPPORTED_INTERFACE_LANGUAGES.filter((candidate) => candidate !== 'fr')) {
      for (const key of SHORTENED) {
        expect(translateLinkFamilies(language, key)).not.toBe(translateLinkFamilies('fr', key));
      }
    }
  });

  test('le (i) qui reste a sa question dans les sept langues', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadLinkFamiliesCatalog(language);
      for (const key of ['linkFamilies.tracking.create.name.question'] as const) {
        expect(translateLinkFamilies(language, key).endsWith(language === 'ar' ? '؟' : '?')).toBe(true);
      }
    }
  });
});


