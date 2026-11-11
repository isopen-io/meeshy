import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AffiliateToken } from '@/lib/api/affiliate-tokens';
import type { CommunityLink } from '@/lib/api/community-links';
import type { ShareLinkUpdateOutcome } from '@/lib/api/link-actions';
import type { MyShareLink, ShareLinkPolicy } from '@/lib/api/links';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadInviteCatalog, translateInvite } from '@/lib/i18n-invite-catalog';
import { loadLinkFamiliesCatalog, translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { controlledBy, perceivableText } from '@/test-support/perceivable-text';

import { AffiliateTokenRow } from './affiliate-links';
import { CommunityLinkRow } from './community-links';
import { ShareLinkRow } from './links-parts';
import { EditLinkForm } from './share-link-edit';
import { LinkConfiguration } from './share-link-configuration';
import { ConfigurationCard, LinkStatTiles } from './share-link-detail-parts';

/**
 * L'ÉPURE DES ENTRÉES DE LIENS, DEUXIÈME PASSE (#17595, épure #17584) — la
 * rangée d'un lien nomme sans répéter, le rare passe derrière « Plus » ou
 * « Modifier », et les formulaires nomment leurs champs en un mot, l'explication
 * derrière un (i) dont le nom est la question. Rien n'est perdu : ce qui quitte
 * l'écran reste lu, ou reste atteignable.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadLinkFamiliesCatalog('fr'), loadInviteCatalog('fr')]);
  ensureHappyDomRegistered({ url: 'http://localhost/links/share/mshy_l1' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  window.location.hash = '';
  unmountAll();
});

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

const noop = () => undefined;

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

describe('la rangée d’un lien de partage', () => {
  test('inactif : le disque tireté le dit, « Inactif » n’est plus écrit — mais reste lu par le lecteur d’écran', async () => {
    const host = await mount(
      <ul>
        <ShareLinkRow language="fr" link={shareLink({ isActive: false, inactiveReason: 'REVOKED' })} copied={false} onCopy={noop} />
      </ul>,
    );
    expect(seen(host).join(' | ')).not.toContain('Inactif');
    expect(host.querySelector('a')?.getAttribute('aria-label')).toContain('Inactif');
  });

  test('expiré : « Expiré » seul, jamais « Lien expiré » en plus d’un état redit', async () => {
    const host = await mount(
      <ul>
        <ShareLinkRow language="fr" link={shareLink({ isActive: false, inactiveReason: 'LINK_EXPIRED', expiresAt: '2000-01-01T00:00:00.000Z' })} copied={false} onCopy={noop} />
      </ul>,
    );
    const text = seen(host);
    expect(text).toContain('Expiré');
    expect(text.join(' | ')).not.toContain('Lien expiré');
    expect(text.join(' | ')).not.toContain('Inactif');
  });

  test('la rangée garde le nom du lien et « N rejoints » ; le titre de la conversation, tronqué, part à la fiche', async () => {
    const host = await mount(
      <ul>
        <ShareLinkRow language="fr" link={shareLink()} copied={false} onCopy={noop} />
      </ul>,
    );
    const text = seen(host);
    expect(text).toContain('Invitation');
    expect(text).toContain('31 rejoints');
    expect(text.join(' | ')).not.toContain('Salle sécurité');
    expect(host.querySelector('a')?.getAttribute('aria-label')).toContain('Salle sécurité du réseau');
    expect(host.querySelector('[data-share-link-copy]')).not.toBeNull();
  });
});

const token = (): AffiliateToken => ({
  id: 't1',
  token: 'abc',
  name: 'Conférence Dourdan 2026',
  isActive: true,
  currentUses: 4,
  maxUses: 50,
  referrals: 4,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
});

describe('la rangée d’un lien de parrainage', () => {
  test('au repos : l’action nominale (Copier) et « Plus » — Partager et Supprimer sont rangés', async () => {
    const host = await mount(
      <ul>
        <AffiliateTokenRow language="fr" token={token()} copied={false} onCopy={noop} onShare={noop} onDelete={noop} />
      </ul>,
    );
    const names = [...host.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['Copier le lien de parrainage', 'Plus']);
    expect(host.querySelector('[data-row-action="share"]')).toBeNull();
    expect(host.querySelector('[data-row-action="delete"]')).toBeNull();
  });

  test('« Plus » ouvre Partager et Supprimer, qui restent atteignables et agissent', async () => {
    const calls: string[] = [];
    const host = await mount(
      <ul>
        <AffiliateTokenRow language="fr" token={token()} copied={false} onCopy={noop} onShare={() => calls.push('share')} onDelete={() => calls.push('delete')} />
      </ul>,
    );
    const more = host.querySelector<HTMLButtonElement>('[data-row-action="more"]');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    await click(more);
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    await click(host.querySelector('[data-row-action="share"]'));
    expect(calls).toEqual(['share']);
    await click(host.querySelector<HTMLButtonElement>('[data-row-action="more"]'));
    await click(host.querySelector('[data-row-action="delete"]'));
    expect(calls).toEqual(['share', 'delete']);
    expect(host.querySelector('[data-row-action="delete"]')).toBeNull();
  });

  test('Échap referme le menu', async () => {
    const host = await mount(
      <ul>
        <AffiliateTokenRow language="fr" token={token()} copied={false} onCopy={noop} onShare={noop} onDelete={noop} />
      </ul>,
    );
    await click(host.querySelector('[data-row-action="more"]'));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[data-row-action="share"]')).toBeNull();
  });
});

const community = (overrides: Partial<CommunityLink> = {}): CommunityLink => ({
  id: 'c1',
  name: 'Quartier',
  identifier: 'quartier',
  avatar: null,
  isPrivate: false,
  role: 'admin',
  memberCount: 248,
  createdAt: null,
  ...overrides,
});

describe('la rangée d’une communauté', () => {
  test('« 248 membres · Administrateur » — la visibilité reste à la fiche', () => {
    const html = renderToStaticMarkup(<CommunityLinkRow language="fr" link={community()} copied={false} onCopy={noop} />).replace(/ /gu, ' ');
    expect(html).toContain('248 membres · Administrateur');
    expect(html).not.toContain('Publique');
    expect(renderToStaticMarkup(<CommunityLinkRow language="fr" link={community({ isPrivate: true })} copied={false} onCopy={noop} />)).not.toContain('Privée');
  });
});

describe('les clés qui n’ont plus de lecteur sont supprimées des sept langues', () => {
  test('ni tuile « Communautés », ni titre de section, ni « Demandé à l’arrivée », ni phrase des statistiques', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await Promise.all([loadLinkFamiliesCatalog(language), loadInviteCatalog(language)]);
      for (const key of ['linkFamilies.community.stats.communities', 'linkFamilies.community.section']) {
        expect(translateLinkFamilies(language, key as never) as unknown).toBeUndefined();
      }
      for (const key of ['linkDetail.config.asked', 'linkDetail.config.asked.none']) {
        expect(translateInvite(language, key as never) as unknown).toBeUndefined();
      }
    }
  });
});

const EDIT_QUESTIONS = ['Qui voit le nom du lien ?', 'Qui voit ce message ?', 'Comment choisir certaines langues ?'] as const;

describe('le formulaire « Modifier le lien »', () => {
  const mountForm = () =>
    mount(<EditLinkForm language="fr" link={shareLink()} policy={POLICY} now={() => new Date('2026-09-24T12:00:00Z')} onSave={async () => 'done'} onToggleActive={noop} onDelete={noop} />);

  test('les champs se nomment en un mot : « Nom », « Message »', async () => {
    const host = await mountForm();
    const text = seen(host);
    expect(text).toContain('Nom');
    expect(text).toContain('Message');
    const joined = text.join(' | ');
    expect(joined).not.toContain('visible par toi seul');
    expect(joined).not.toContain('Message d’invitation');
    expect(joined).not.toContain('affiché aux invités');
    expect(joined).not.toContain('Désactive « Toutes les langues »');
  });

  test('l’explication passe derrière un (i) dont le nom est la question, note lue repliée, champ relié à sa note', async () => {
    const host = await mountForm();
    const name = infoButton(host, EDIT_QUESTIONS[0]);
    expect(controlledBy(name)?.textContent).toBe('Visible par toi seul');
    expect(controlledBy(name)?.className).toContain('sr-only');
    expect(host.querySelector('#link-edit-name')?.getAttribute('aria-describedby')).toContain(name.getAttribute('aria-controls') ?? '?');
    expect(controlledBy(infoButton(host, EDIT_QUESTIONS[1]))?.textContent).toBe('Affiché aux invités');
    const languages = infoButton(host, EDIT_QUESTIONS[2]);
    expect(controlledBy(languages)?.textContent).toBe('Désactive « Toutes les langues » pour choisir.');
    await click(languages);
    expect(languages.getAttribute('aria-expanded')).toBe('true');
    expect(controlledBy(languages)?.className).not.toContain('sr-only');
  });

  test('« Utilisations » et « Maximum » : le verbe est porté par la section, l’effet par la valeur', async () => {
    const host = await mountForm();
    await click(host.querySelector('[data-link-rule="limitUses"]'));
    const text = seen(host);
    expect(text).toContain('Utilisations');
    expect(text).toContain('Maximum');
    expect(text.join(' | ')).not.toContain('Limiter les utilisations');
  });

  test('les deux « Maximum » se distinguent à l’oreille : chacun dit la rangée qu’il borne', async () => {
    const host = await mountForm();
    for (const rule of ['limitUses', 'limitConcurrent']) {
      const toggle = host.querySelector(`[data-link-rule="${rule}"]`);
      if (toggle?.getAttribute('aria-checked') === 'false') await click(toggle);
    }
    const nameOf = (input: Element): string =>
      (input.getAttribute('aria-labelledby') ?? '')
        .split(' ')
        .map((id) => host.querySelector(`[id="${id}"]`)?.textContent?.trim() ?? '?')
        .join(' ');
    expect([...host.querySelectorAll('input[type="number"]')].map(nameOf)).toEqual(['Utilisations Maximum', 'En même temps Maximum']);
  });

  test('« Autoriser » garde, derrière un (i), qu’il ne gouverne que les invités sans compte', async () => {
    const host = await mountForm();
    expect(controlledBy(infoButton(host, 'À qui s’appliquent ces autorisations ?'))?.textContent).toBe('Aux invités qui rejoignent sans compte Meeshy.');
  });
});

describe('les tuiles de statistiques', () => {
  test('sans mesure : « Pas encore mesuré » en une ligne, la phrase longue est supprimée', async () => {
    const host = await mount(<LinkStatTiles language="fr" stats={null} />);
    const text = seen(host);
    expect(text).toContain('Pas encore mesuré');
    expect(text.join(' | ')).not.toContain('Les statistiques de ce lien');
    expect(host.querySelectorAll('.sr-only')).toHaveLength(3);
  });
});

describe('la configuration en lecture', () => {
  test('« Demander aux invités », des rangées nominales, « Pseudo » — plus de « Demandé à l’arrivée » ni de « Prénom »', async () => {
    const host = await mount(<ConfigurationCard language="fr" link={shareLink()} policy={{ ...POLICY, requireEmail: true }} />);
    const text = seen(host).join(' | ');
    expect(text).toContain('Demander aux invités');
    expect(text).toContain('Pseudo');
    expect(text).toContain('E-mail');
    expect(text).not.toContain('Conditions d’entrée');
    expect(text).not.toContain('Demandé à l’arrivée');
    expect(text).not.toContain('Prénom');
  });

  test('compte obligatoire : seules les rangées utiles restent, sans « Rien »', async () => {
    const host = await mount(<ConfigurationCard language="fr" link={shareLink()} policy={{ ...POLICY, requireAccount: true }} />);
    const text = seen(host).join(' | ');
    expect(text).toContain('Compte Meeshy');
    expect(text).toContain('Obligatoire');
    expect(text).not.toContain('Rien');
  });

  test('« Modifier » reste une ancre #link-edit atteignable', () => {
    expect(renderToStaticMarkup(<ConfigurationCard language="fr" link={shareLink()} policy={POLICY} />)).toContain('href="#link-edit"');
  });
});

describe('la fiche d’un lien : la configuration, puis le formulaire derrière « Modifier »', () => {
  const mountConfiguration = (onSave: (outcome: ShareLinkUpdateOutcome) => void = noop) =>
    mount(
      <LinkConfiguration
        language="fr"
        link={shareLink()}
        policy={POLICY}
        now={() => new Date('2026-09-24T12:00:00Z')}
        onSave={async () => {
          onSave('done');
          return 'done';
        }}
        onToggleActive={noop}
        onDelete={noop}
      />,
    );

  test('au repos, la configuration se lit et le formulaire qui redit les huit réglages n’est pas monté', async () => {
    const host = await mountConfiguration();
    expect(host.querySelector('[data-share-link-configuration]')).not.toBeNull();
    expect(host.querySelector('[data-link-edit-form]')).toBeNull();
    expect(document.querySelector('[data-link-edit-form]')).toBeNull();
  });

  test('« Modifier » ouvre le formulaire dans une fiche, avec ses gestes (désactiver, supprimer)', async () => {
    const host = await mountConfiguration();
    await click(host.querySelector('[data-share-link-edit-anchor]'));
    const form = document.querySelector('[data-link-edit-form]');
    expect(form).not.toBeNull();
    expect(document.querySelector('[data-share-link-action="delete"]')).not.toBeNull();
    expect(document.querySelector('[data-share-link-action="disable"]')).not.toBeNull();
  });

  test('l’adresse #link-edit ouvre la fiche d’emblée', async () => {
    window.location.hash = '#link-edit';
    await mountConfiguration();
    expect(document.querySelector('[data-link-edit-form]')).not.toBeNull();
  });

  test('enregistrer referme la fiche', async () => {
    const saved: string[] = [];
    const host = await mountConfiguration((outcome) => saved.push(outcome));
    await click(host.querySelector('[data-share-link-edit-anchor]'));
    await click(document.querySelector('[data-link-rule="allowAnonymousFiles"]'));
    await act(async () => {
      document.querySelector('[data-link-edit-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(saved).toEqual(['done']);
    expect(document.querySelector('[data-link-edit-form]')).toBeNull();
  });
});

describe('les sept langues portent les mots courts, traduits', () => {
  test('« Plus », « Expiré », « Pas encore mesuré » et les questions des (i) existent partout', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await Promise.all([loadInterfaceCatalog(language), loadLinkFamiliesCatalog(language), loadInviteCatalog(language)]);
      if (language !== 'fr') {
        expect(translateLinkFamilies(language, 'linkFamilies.more')).not.toBe(translateLinkFamilies('fr', 'linkFamilies.more'));
        expect(translate(language, 'links.status.expired')).not.toBe(translate('fr', 'links.status.expired'));
        expect(translateInvite(language, 'linkDetail.stats.unavailable')).not.toBe(translateInvite('fr', 'linkDetail.stats.unavailable'));
      }
      for (const key of ['linkDetail.edit.name.question', 'linkDetail.edit.message.question', 'linkDetail.edit.languages.question'] as const) {
        expect(translateInvite(language, key).endsWith(language === 'ar' ? '؟' : '?')).toBe(true);
      }
    }
  });
});

describe('le nom accessible d’un (i) est une question', () => {
  test('les trois (i) du formulaire sont des questions', async () => {
    const host = await mount(<EditLinkForm language="fr" link={shareLink()} policy={POLICY} now={() => new Date()} onSave={async () => 'done'} onToggleActive={noop} onDelete={noop} />);
    for (const question of EDIT_QUESTIONS) expect(perceivableText(host)).toContain(question);
  });
});
