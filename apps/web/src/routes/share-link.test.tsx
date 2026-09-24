import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ShareLinkUpdateOutcome } from '@/lib/api/link-actions';
import type { ShareLinkStats } from '@/lib/api/link-stats';
import type { MyShareLink, ShareLinkPatch, ShareLinkPolicy } from '@/lib/api/links';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { arrivalAge, ConfigurationCard, InviteLinkCard, LinkStatTiles, RecentArrivals } from './share-link-detail-parts';
import { EditLinkForm } from './share-link-edit';

/**
 * LA PAGE DU CRÉATEUR D'UN LIEN (#7797) — ce que les pièces DISENT et ce que
 * chaque geste déclenche : la carte, les tuiles (valeurs ou « — »), les
 * arrivées, la configuration en lecture, et l'édition optimiste avec son
 * retour arrière.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInviteCatalog('fr')]);
  ensureHappyDomRegistered({ url: 'http://localhost/links/share/mshy_l1' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

const noop = () => undefined;
const plain = (html: string) => html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');

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

const link = (overrides: Partial<MyShareLink> = {}): MyShareLink => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: null,
  name: 'Nova Club — Discord',
  isActive: true,
  currentUses: 412,
  maxUses: null,
  expiresAt: '2026-10-01T21:59:00.000Z',
  createdAt: '2026-09-02T09:00:00.000Z',
  conversationTitle: 'Nova Club',
  inactiveReason: null,
  description: 'Viens, on commente l’épisode.',
  policy: POLICY,
  ...overrides,
});

const NOW = new Date('2026-09-24T12:00:00.000Z');

const STATS: ShareLinkStats = {
  visits: 1284,
  arrivals: 412,
  anonymousArrivals: 157,
  arrivalsByLanguage: [
    { code: 'fr', count: 3 },
    { code: 'ko', count: 1 },
  ],
  arrivalsByCountry: [],
  recentArrivals: [
    { participantId: 'p1', displayName: 'Priya', avatar: null, isAnonymous: true, country: 'IN', language: 'en', joinedAt: '2026-09-24T11:58:00.000Z' },
    { participantId: 'p2', displayName: 'Kwame', avatar: null, isAnonymous: false, country: null, language: null, joinedAt: '2026-09-24T11:00:00.000Z' },
  ],
};

describe('la carte du lien', () => {
  test('le groupe, la date, « Actif », l’adresse lisible, le message, puis Partager et Copier le lien', () => {
    const html = renderToStaticMarkup(<InviteLinkCard language="fr" link={link()} url="https://meeshy.me/chat/mshy_l1" copied={false} onShare={noop} onCopy={noop} />);
    const text = plain(html);
    expect(text).toContain('Nova Club');
    expect(text).toContain('Lien créé le 2 sept. 2026');
    expect(text).toContain('Actif');
    expect(text).toContain('meeshy.me/chat/mshy_l1');
    expect(text).not.toContain('https://');
    expect(text).toContain('« Viens, on commente l’épisode. »');
    expect(html.match(/data-share-link-action="([a-z]+)"/gu)).toEqual(['data-share-link-action="share"', 'data-share-link-action="copy"']);
  });

  test('un lien fermé : « Inactif » ÉCRIT, et la cause se lit', () => {
    const html = renderToStaticMarkup(
      <InviteLinkCard language="fr" link={link({ isActive: false, inactiveReason: 'CONVERSATION_CLOSED' })} url="https://meeshy.me/chat/mshy_l1" copied={false} onShare={noop} onCopy={noop} />,
    );
    expect(plain(html)).toContain('Inactif');
    expect(html).toContain('data-share-link-reason');
  });

  test('copié : le bouton le dit', () => {
    const html = renderToStaticMarkup(<InviteLinkCard language="fr" link={link()} url="https://meeshy.me/chat/mshy_l1" copied onShare={noop} onCopy={noop} />);
    expect(plain(html)).toContain('Lien copié');
  });
});

describe('Visites / Arrivées / Sans compte', () => {
  test('servies : les trois valeurs, formatées', () => {
    const text = plain(renderToStaticMarkup(<LinkStatTiles language="fr" stats={STATS} />));
    expect(text).toContain('1 284 Visites');
    expect(text).toContain('412 Arrivées');
    expect(text).toContain('157 Sans compte');
  });

  test('pas encore servies : « — », dit « pas encore mesuré », jamais zéro', () => {
    const html = renderToStaticMarkup(<LinkStatTiles language="fr" stats={null} />);
    expect(plain(html)).toContain('pas encore mesuré');
    expect(html).toContain('data-share-link-stats-unavailable');
    expect(plain(html)).not.toMatch(/\b0\b/u);
  });

  test('première lecture sans cache : la même forme, marquée occupée — aucune roue', () => {
    const html = renderToStaticMarkup(<LinkStatTiles language="fr" stats={undefined} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-share-link-stats-unavailable');
  });
});

describe('arrivés récemment', () => {
  test('nom, drapeau nommé, badge « sans compte » pour les seuls invités, ancienneté', () => {
    const html = renderToStaticMarkup(<RecentArrivals language="fr" stats={STATS} now={NOW} />);
    expect(html).toContain('🇮🇳');
    expect(html).toContain('aria-label="Inde"');
    expect(html.match(/data-share-link-arrival-anonymous/gu)).toHaveLength(1);
    expect(plain(html)).toContain('Priya');
    expect(plain(html)).toContain('il y a 2 min');
  });

  test('personne encore : l’état vide le dit', () => {
    const html = renderToStaticMarkup(<RecentArrivals language="fr" stats={{ ...STATS, recentArrivals: [] }} now={NOW} />);
    expect(plain(html)).toContain('Personne n’est encore arrivé par ce lien.');
  });

  test('l’ancienneté suit la langue de l’interface', async () => {
    expect(arrivalAge('2026-09-24T11:00:00.000Z', NOW, 'en')).toBe('1 hr. ago');
    expect(arrivalAge('2026-09-23T11:00:00.000Z', NOW, 'fr')).toBe('hier');
  });
});

describe('la configuration, en lecture', () => {
  test('droits cochés ou barrés, conditions, limites et langues', () => {
    const html = renderToStaticMarkup(<ConfigurationCard language="fr" link={link()} policy={POLICY} />);
    const text = plain(html);
    expect(text).toContain('Compte Meeshy Facultatif');
    expect(text).toContain('Demandé à l’arrivée Prénom');
    expect(text).toContain('Utilisations 412 / illimité');
    expect(text).toContain('En même temps 50 max');
    expect(text).toMatch(/Expire le 1 oct\. 2026/u);
    expect(text).toContain('Toutes les langues');
    expect(text).toContain('Envoyer des fichiers non autorisé');
    expect(html).toContain('href="#link-edit"');
  });

  test('compte obligatoire : plus rien n’est « demandé à l’arrivée »', () => {
    const text = plain(renderToStaticMarkup(<ConfigurationCard language="fr" link={link()} policy={{ ...POLICY, requireAccount: true }} />));
    expect(text).toContain('Compte Meeshy Obligatoire');
    expect(text).toContain('Demandé à l’arrivée Rien');
  });

  test('sans politique lue : elle le dit, sans rien inventer', () => {
    const html = renderToStaticMarkup(<ConfigurationCard language="fr" link={link({ policy: null })} policy={null} />);
    expect(plain(html)).toContain('La configuration de ce lien se charge…');
    expect(html).not.toContain('Facultatif');
  });
});

type Saved = { readonly patches: ShareLinkPatch[] };

function mountForm(
  options: { readonly base?: MyShareLink; readonly outcome?: ShareLinkUpdateOutcome } = {},
): { readonly host: HTMLDivElement; readonly saved: Saved; readonly calls: string[] } {
  const saved: Saved = { patches: [] };
  const calls: string[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  const base = options.base ?? link();
  act(() => {
    root.render(
      <EditLinkForm
        language="fr"
        link={base}
        policy={base.policy ?? POLICY}
        now={() => NOW}
        onSave={async (patch) => {
          saved.patches.push(patch);
          return options.outcome ?? 'done';
        }}
        onToggleActive={() => calls.push('toggle')}
        onDelete={() => calls.push('delete')}
      />,
    );
  });
  return { host: container, saved, calls };
}

async function submit(host: HTMLElement) {
  const form = host.querySelector<HTMLFormElement>('[data-link-edit-form]');
  await act(async () => {
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function press(element: Element | null) {
  await act(async () => {
    (element as HTMLElement | null)?.click();
  });
}

describe('l’édition', () => {
  test('le formulaire s’ouvre sur ce que le lien EST', () => {
    const { host } = mountForm();
    expect(host.querySelector<HTMLInputElement>('#link-edit-name')?.value).toBe('Nova Club — Discord');
    expect(host.querySelector<HTMLTextAreaElement>('#link-edit-message')?.value).toBe('Viens, on commente l’épisode.');
    expect(host.querySelector<HTMLSelectElement>('#link-edit-expiration')?.value).toBe('keep');
    expect(host.querySelector('[data-link-rule="allLanguages"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-link-rule="allowAnonymousFiles"]')?.getAttribute('aria-checked')).toBe('false');
  });

  test('Enregistrer n’envoie que ce qui a changé', async () => {
    const { host, saved } = mountForm();
    typeInto(host.querySelector('#link-edit-name'), 'Nova — soirée');
    await press(host.querySelector('[data-link-rule="allowAnonymousFiles"]'));
    await submit(host);
    expect(saved.patches).toEqual([{ name: 'Nova — soirée', allowAnonymousFiles: true }]);
  });

  test('un refus de la passerelle rend au formulaire ce que le lien ÉTAIT (retour arrière)', async () => {
    const { host, saved } = mountForm({ outcome: 'failed' });
    typeInto(host.querySelector('#link-edit-name'), 'Autre nom');
    await submit(host);
    expect(saved.patches).toHaveLength(1);
    expect(host.querySelector<HTMLInputElement>('#link-edit-name')?.value).toBe('Nova Club — Discord');
  });

  test('une sélection de langues : choisir, puis décocher « Toutes les langues »', async () => {
    const { host, saved } = mountForm();
    await press(host.querySelector('[data-link-rule="allLanguages"]'));
    await press(host.querySelector('[data-link-language="ko"]'));
    await press(host.querySelector('[data-link-language="fr"]'));
    expect(host.querySelector('[data-link-language="ko"]')?.getAttribute('aria-pressed')).toBe('true');
    await submit(host);
    expect(saved.patches).toEqual([{ allowedLanguages: ['fr', 'ko'] }]);
  });

  test('aucune langue choisie : le refus se dit, et rien ne part', async () => {
    const { host, saved } = mountForm();
    await press(host.querySelector('[data-link-rule="allLanguages"]'));
    await submit(host);
    expect(saved.patches).toEqual([]);
    expect(host.querySelector('[data-link-edit-languages]')?.parentElement?.textContent).toContain('Choisis au moins une langue.');
  });

  test('une limite hors bornes se refuse SOUS son champ', async () => {
    const { host, saved } = mountForm();
    await press(host.querySelector('[data-link-rule="limitUses"]'));
    typeInto(host.querySelector('#link-edit-max-uses'), '0');
    await submit(host);
    expect(saved.patches).toEqual([]);
    expect(host.querySelector('#link-edit-max-uses')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#link-edit-max-uses-error')?.textContent?.replace(/\s/gu, ' ')).toContain('entre 1 et 10 000');
  });

  test('actif : « Désactiver » et « Supprimer » ; supprimer DEMANDE confirmation (l’hôte ouvre le dialogue)', async () => {
    const { host, calls } = mountForm();
    const actions = [...host.querySelectorAll('[data-share-link-action]')].map((node) => node.getAttribute('data-share-link-action'));
    expect(actions).toEqual(['disable', 'delete']);
    await press(host.querySelector('[data-share-link-action="delete"]'));
    await press(host.querySelector('[data-share-link-action="disable"]'));
    expect(calls).toEqual(['delete', 'toggle']);
  });

  test('désactivé à la main : « Activer » ; conversation fermée : ni l’un ni l’autre', () => {
    const revoked = mountForm({ base: link({ isActive: false, inactiveReason: 'REVOKED' }) });
    expect(revoked.host.querySelector('[data-share-link-action="activate"]')).not.toBeNull();
    act(() => mounted?.root.unmount());
    const closed = mountForm({ base: link({ isActive: false, inactiveReason: 'CONVERSATION_CLOSED' }) });
    expect(closed.host.querySelector('[data-share-link-action="activate"], [data-share-link-action="disable"]')).toBeNull();
    expect(closed.host.querySelector('[data-share-link-action="delete"]')).not.toBeNull();
  });
});
