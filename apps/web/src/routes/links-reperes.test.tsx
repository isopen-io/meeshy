import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { AffiliateToken } from '@/lib/api/affiliate-tokens';
import type { MyTrackingLink } from '@/lib/api/my-tracking-links';
import type { MyShareLink, ShareLinkPolicy } from '@/lib/api/links';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadInviteCatalog, translateInvite } from '@/lib/i18n-invite-catalog';
import { loadLinkFamiliesCatalog, translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import AffiliateLinkNewScreen from './affiliate-link-new';
import { AffiliateTokenRow } from './affiliate-links';
import { FamilyEmpty } from './link-families-parts';
import LinksScreen from './links';
import { ShareLinkRow, ShareLinksEmpty } from './links-parts';
import MyTrackingLinkNewScreen from './my-tracking-link-new';
import { TrackingLinkRow } from './my-tracking-links';
import { InviteLinkCard } from './share-link-detail-parts';
import { EditLinkForm } from './share-link-edit';
import ShareLinkNewScreen from './share-link-new';

/**
 * LES REPÈRES DES ÉCRANS DE LIENS (#17641, épure #17584, règle 7) — les liens
 * sont propres à Meeshy : chaque type de lien, chaque autorisation et chaque
 * geste garde, LISIBLE AU REPOS, la phrase qui dit ce qu'il fait. Les témoins
 * lisent ce qui est vu sans aucun clic, hors de toute note repliée.
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

const seenIn = (host: ParentNode, selector: string): string => {
  const scope = host.querySelector(selector);
  if (scope === null) throw new Error(`aucun bloc ${selector}`);
  return seen(scope).join(' | ');
};

const noop = () => undefined;

describe('le hub /links dit à quoi sert chaque type de lien', () => {
  test('chaque famille porte, sous son nom, une phrase lisible sans ouvrir un (i)', async () => {
    const host = await mount(<LinksScreen />);
    expect(seenIn(host, '[data-links-family="share"]')).toBe('Partage | Invitez des contacts à rejoindre vos conversations');
    expect(seenIn(host, '[data-links-family="tracking"]')).toBe('Suivi | Suivez les performances de vos liens de référence');
    expect(seenIn(host, '[data-links-family="community"]')).toBe('Communautés | Gérez les liens d’invitation vers vos communautés');
    expect(seenIn(host, '[data-links-family="affiliate"]')).toBe('Parrainage | Invitez votre réseau sur Meeshy et suivez vos inscrits');
  });

  test('la phrase étant visible, aucun (i) ne la redit', async () => {
    const host = await mount(<LinksScreen />);
    expect(host.querySelectorAll('button[aria-expanded]')).toHaveLength(0);
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

const shareLink = (overrides: Partial<MyShareLink> = {}): MyShareLink => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: null,
  name: 'Invitation',
  isActive: true,
  currentUses: 31,
  maxUses: null,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
  conversationTitle: 'Salle sécurité du réseau',
  inactiveReason: null,
  description: 'Viens',
  policy: POLICY,
  ...overrides,
});

const mountRow = (link: MyShareLink) =>
  mount(
    <ul>
      <ShareLinkRow language="fr" link={link} copied={false} onCopy={noop} />
    </ul>,
  );

describe('la rangée d’un lien de partage montre de quoi le reconnaître', () => {
  test('nom, usages, conversation et date de création', async () => {
    const text = seen(await mountRow(shareLink())).join(' ');
    expect(text).toContain('Invitation');
    expect(text).toContain('31 rejoints');
    expect(text).toContain('Salle sécurité du réseau');
    expect(text).toContain('Créé le 10 sept. 2026');
  });

  test('l’expiration s’ajoute à la date de création', async () => {
    const text = seen(await mountRow(shareLink({ expiresAt: '2999-01-05T09:00:00.000Z' }))).join(' ');
    expect(text).toContain('Créé le 10 sept. 2026');
    expect(text).toContain('Expire le 5 janv. 2999');
  });

  test('un lien inactif l’écrit', async () => {
    expect(seen(await mountRow(shareLink({ isActive: false, inactiveReason: 'REVOKED' }))).join(' ')).toContain('Inactif');
  });
});

const trackingLink = (): MyTrackingLink => ({
    token: 'rentree26',
    name: 'Campagne de rentrée',
    originalUrl: 'https://exemple.com/page',
    isActive: true,
    totalClicks: 12,
    uniqueClicks: 9,
    campaign: null,
    source: null,
    medium: null,
    expiresAt: null,
    createdAt: '2026-09-10T09:00:00.000Z',
    lastClickedAt: null,
});

const token = (): AffiliateToken => ({
  id: 't1',
  token: 'abc',
  name: 'Invitation amis',
  isActive: true,
  currentUses: 4,
  maxUses: 50,
  referrals: 4,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
});

describe('les rangées de suivi et de parrainage portent leur date de création', () => {
  test('suivi : clics, uniques et « Créé le »', async () => {
    const host = await mount(
      <ul>
        <TrackingLinkRow language="fr" link={trackingLink()} copied={false} onCopy={noop} />
      </ul>,
    );
    const text = seen(host).join(' ');
    expect(text).toContain('12 clics');
    expect(text).toContain('Créé le 10 sept. 2026');
  });

  test('parrainage : la jauge et « Créé le »', async () => {
    const host = await mount(
      <ul>
        <AffiliateTokenRow language="fr" token={token()} copied={false} onCopy={noop} onShare={noop} onDelete={noop} />
      </ul>,
    );
    const text = seen(host).join(' ');
    expect(text).toContain('4 sur 50');
    expect(text).toContain('Créé le 10 sept. 2026');
  });
});

describe('un état vide dit ce qu’est le lien et propose d’en créer un', () => {
  test('liens de partage', async () => {
    const host = await mount(<ShareLinksEmpty language="fr" />);
    expect(seen(host)).toEqual(['Aucun lien de partage', 'Créez un lien pour inviter des personnes dans une conversation', 'Créer un lien de partage']);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/links/share/new');
  });

  test('les autres familles : le même gabarit', async () => {
    const host = await mount(
      <FamilyEmpty
        family="tracking"
        glyph={null}
        title={translateLinkFamilies('fr', 'linkFamilies.tracking.empty.title')}
        subtitle={translateLinkFamilies('fr', 'linkFamilies.tracking.empty.subtitle')}
        cta={{ to: 'myTrackingLinkNew', label: translateLinkFamilies('fr', 'links.hub.tracking.create') }}
      />,
    );
    expect(seen(host)).toEqual(['Aucun lien de suivi', 'Créez un lien pour suivre vos clics et vos campagnes', 'Créer un lien de suivi']);
  });
});

describe('« Nouveau lien de partage » oriente et dit l’effet de chaque autorisation', () => {
  test('une phrase d’orientation ouvre le formulaire', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    expect(seenIn(host, '[data-links-intro]')).toBe('Ce lien fait entrer des invités dans une conversation, avec ou sans compte Meeshy.');
  });

  test('« Autoriser » dit au repos à qui il s’applique, et chaque autorisation ce qu’elle permet', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    const text = seen(host);
    expect(text).toContain('Ce que les invités anonymes peuvent faire');
    expect(seenIn(host, '[data-link-rule-row="allowAnonymousMessages"]')).toBe('Messages | Les invités peuvent écrire dans la conversation');
    expect(seenIn(host, '[data-link-rule-row="allowAnonymousImages"]')).toBe('Images | Les invités peuvent partager des photos');
    expect(seenIn(host, '[data-link-rule-row="allowAnonymousFiles"]')).toBe('Fichiers | Les invités peuvent envoyer des documents');
    expect(seenIn(host, '[data-link-rule-row="allowViewHistory"]')).toBe('Historique | Les invités voient les messages précédents');
  });

  test('les exigences non évidentes disent leur effet ; pseudo et e-mail, usuels, restent nus', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    expect(seenIn(host, '[data-link-rule-row="requireAccount"]')).toBe('Compte Meeshy | Seuls les membres Meeshy peuvent rejoindre');
    expect(seenIn(host, '[data-link-rule-row="requireBirthday"]')).toBe('Date de naissance | Permet le contrôle d’âge');
    expect(seenIn(host, '[data-link-rule-row="requireNickname"]')).toBe('Pseudo');
    expect(seenIn(host, '[data-link-rule-row="requireEmail"]')).toBe('E-mail');
  });

  test('chaque bascule est décrite par sa phrase d’effet', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    const toggle = host.querySelector('[data-link-rule="allowViewHistory"]');
    const described = toggle?.getAttribute('aria-describedby') ?? '?';
    expect(host.querySelector(`[id="${described}"]`)?.textContent).toBe('Les invités voient les messages précédents');
  });

  test('« Limiter » dit ce que bornent ses réglages', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    expect(seen(host)).toContain('Contrôlez l’audience et la durée de vie du lien');
  });

  test('plus aucun (i) : rien de ce qui explique n’est derrière un toucher', async () => {
    const host = await mount(<ShareLinkNewScreen />);
    expect(host.querySelectorAll('button[aria-expanded]')).toHaveLength(0);
  });
});

describe('« Modifier le lien » garde les mêmes repères', () => {
  const mountForm = (link = shareLink()) =>
    mount(<EditLinkForm language="fr" link={link} policy={POLICY} now={() => new Date('2026-09-24T12:00:00Z')} onSave={async () => 'done'} onToggleActive={noop} onDelete={noop} />);

  test('qui voit le nom et le message se lit sous chaque champ', async () => {
    const host = await mountForm();
    const text = seen(host);
    expect(text).toContain('Visible par toi seul');
    expect(text).toContain('Affiché aux invités');
    expect(host.querySelector('#link-edit-name')?.getAttribute('aria-describedby')).toBe('link-edit-name-note');
    expect(host.querySelector('[id="link-edit-name-note"]')?.textContent).toBe('Visible par toi seul');
  });

  test('les autorisations et les limites portent les mêmes phrases qu’à la création', async () => {
    const host = await mountForm();
    const text = seen(host);
    expect(text).toContain('Ce que les invités anonymes peuvent faire');
    expect(text).toContain('Les invités voient les messages précédents');
    expect(text).toContain('Contrôlez l’audience et la durée de vie du lien');
    expect(text).toContain('Désactive « Toutes les langues » pour choisir.');
  });

  test('désactiver et supprimer disent ce qu’ils déclenchent', async () => {
    const host = await mountForm();
    expect(seenIn(host, '[data-share-link-actions-note]')).toBe('Désactivé, le lien ne fait plus entrer personne. Supprimé, il disparaît pour de bon.');
  });
});

describe('la carte d’un lien de partage dit ce que fait son adresse', () => {
  const mountCard = (link: MyShareLink) => mount(<InviteLinkCard language="fr" link={link} url="https://meeshy.me/chat/mshy_l1" copied={false} onShare={noop} onCopy={noop} />);

  test('lien actif : qui ouvre l’adresse peut rejoindre', async () => {
    const host = await mountCard(shareLink());
    const text = seen(host);
    expect(text).toContain('Qui ouvre cette adresse peut rejoindre la conversation, selon la configuration ci-dessous.');
  });

  test('lien inactif : la raison remplace la promesse', async () => {
    const host = await mountCard(shareLink({ isActive: false, inactiveReason: 'REVOKED' }));
    expect(seen(host).join(' ')).not.toContain('Qui ouvre cette adresse');
  });
});

describe('« Nouveau lien de suivi » et « Nouveau lien de parrainage » orientent', () => {
  test('suivi : ce que fait le lien, à quoi servent les UTM, et la consigne du jeton', async () => {
    const host = await mount(<MyTrackingLinkNewScreen />);
    const text = seen(host);
    expect(seenIn(host, '[data-links-intro]')).toBe('Ce lien redirige vers votre adresse et compte chaque clic.');
    expect(text).toContain('Pour savoir d’où viennent vos clics');
    expect(text).toContain('Laissez vide pour un jeton aléatoire.');
  });

  test('parrainage : ce que fait le lien et l’effet de la limite', async () => {
    const host = await mount(<AffiliateLinkNewScreen />);
    expect(seenIn(host, '[data-links-intro]')).toBe('Toute personne qui s’inscrit sur Meeshy par ce lien devient votre filleul.');
    expect(seenIn(host, '[data-link-rule-row="affiliate-limit"]')).toBe('Limiter les inscriptions | Au-delà, le lien n’inscrit plus personne');
  });
});

describe('les repères existent dans les sept langues, traduits', () => {
  test('aucun n’est vide ni copié du français', async () => {
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.flatMap((language) => [loadInterfaceCatalog(language), loadLinkFamiliesCatalog(language), loadInviteCatalog(language)]));
    const families = [
      'links.hub.tracking.description',
      'links.hub.community.description',
      'links.hub.affiliate.description',
      'links.create.intro',
      'links.create.access.account.caption',
      'links.create.section.permissions.subtitle',
      'links.create.permission.messages.caption',
      'links.create.permission.images.caption',
      'links.create.permission.files.caption',
      'links.create.permission.history.caption',
      'links.create.section.limits.subtitle',
      'linkFamilies.tracking.create.intro',
      'linkFamilies.tracking.empty.subtitle',
      'linkFamilies.affiliate.create.intro',
      'linkFamilies.affiliate.empty.subtitle',
      'linkFamilies.community.empty.subtitle',
    ] as const;
    const invite = ['linkDetail.card.effect', 'linkDetail.edit.actions.note'] as const;
    const main = ['links.hub.share.description', 'links.share.empty.subtitle'] as const;
    for (const language of SUPPORTED_INTERFACE_LANGUAGES.filter((candidate) => candidate !== 'fr')) {
      for (const key of families) expect(translateLinkFamilies(language, key)).not.toBe(translateLinkFamilies('fr', key));
      for (const key of invite) expect(translateInvite(language, key)).not.toBe(translateInvite('fr', key));
      for (const key of main) expect(translate(language, key)).not.toBe(translate('fr', key));
    }
  });
});
