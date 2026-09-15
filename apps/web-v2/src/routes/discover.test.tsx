import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { decodeFriendRequest, decodePerson, type FriendRequestRecord, type PersonSummary } from '@/lib/api/friend-requests';
import type { DiscoverTab, Relationship } from '@/lib/discover/view';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  BlockedPersonRow,
  ConnectionAction,
  DiscoverHeader,
  DiscoverOfflineNotice,
  DiscoverTabBar,
  InviteCard,
  PersonResultRow,
  ReceivedRequestRow,
  SentRequestRow,
  discoverTabLabel,
  type ConnectionHandlers,
} from './discover-parts';

/**
 * LA DÉCOUVERTE DESSINÉE (#6363) — miroir `PeopleDiscoveryView`, `DiscoverTab`,
 * `RequestsTab`, `BlockedTab` et `ConnectionActionView` : chaque pièce est
 * rendue sans DOM ni TanStack Query. Ces témoins prouvent ce qu'aucune capture
 * ne dit : le geste qu'une ligne offre selon ce que la personne EST, ce que
 * chaque contrôle ANNONCE, et le point de présence qu'aucune ligne ne peint.
 */

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
});

const noop = () => undefined;
const NOW = new Date('2026-09-13T12:00:00.000Z');
const handlers: ConnectionHandlers = { onAdd: noop, onCancel: noop, onAccept: noop, onReject: noop };

/** Une charge de passerelle qui PORTE la présence d'un inconnu — ce que la loi interdit de peindre. */
const wirePerson = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: 'u-ada',
  username: 'ada',
  displayName: 'Ada Lovelace',
  avatar: null,
  isOnline: true,
  lastActiveAt: '2026-09-13T11:59:30.000Z',
  ...overrides,
});

const ada = decodePerson(wirePerson()) as PersonSummary;

const request = (overrides: Readonly<Record<string, unknown>> = {}): FriendRequestRecord =>
  decodeFriendRequest({
    id: 'f-ada',
    senderId: 'u-ada',
    receiverId: 'u-me',
    status: 'pending',
    message: null,
    createdAt: '2026-09-13T09:00:00.000Z',
    sender: wirePerson(),
    receiver: wirePerson({ id: 'u-me', username: 'moi', displayName: 'Moi' }),
    ...overrides,
  }) as FriendRequestRecord;

const action = (relationship: Relationship) =>
  renderToStaticMarkup(<ConnectionAction language="fr" person={ada} name="Ada Lovelace" relationship={relationship} handlers={handlers} />);

describe('aucune pastille de présence, même quand la charge en porte une', () => {
  test('une personne de la recherche, une demande reçue, une envoyée, un bloqué : aucun point', () => {
    const rows = [
      renderToStaticMarkup(<PersonResultRow language="fr" person={ada} relationship={{ kind: 'none' }} handlers={handlers} />),
      renderToStaticMarkup(<ReceivedRequestRow language="fr" request={request()} now={NOW} onAccept={noop} onReject={noop} />),
      renderToStaticMarkup(<SentRequestRow language="fr" request={request({ senderId: 'u-me', receiverId: 'u-ada', sender: wirePerson({ id: 'u-me' }), receiver: wirePerson() })} now={NOW} onCancel={noop} />),
      renderToStaticMarkup(<BlockedPersonRow language="fr" person={ada} onUnblock={noop} />),
    ];
    rows.forEach((html) => {
      expect(html).toContain('Ada Lovelace');
      expect(html).not.toContain('data-presence');
    });
  });
});

describe('le geste qu’une ligne de recherche offre — `ConnectionActionView`', () => {
  test('inconnu : « Ajouter », qui nomme la personne', () => {
    const html = action({ kind: 'none' });
    expect(html).toContain('data-connection="none"');
    expect(html).toContain('aria-label="Ajouter Ada Lovelace"');
    expect(html).toContain('Ajouter');
  });

  test('demande envoyée : « En attente », dont le geste ANNULE et le dit', () => {
    const html = action({ kind: 'pendingSent', request: request() });
    expect(html).toContain('En attente');
    expect(html).toContain('aria-label="Annuler la demande envoyée à Ada Lovelace"');
  });

  test('demande reçue : refuser et accepter, deux boutons nommés', () => {
    const html = action({ kind: 'pendingReceived', request: request() });
    expect(html).toContain('aria-label="Refuser la demande de Ada Lovelace"');
    expect(html).toContain('aria-label="Accepter la demande de Ada Lovelace"');
  });

  test('contact, bloqué : un état qui se LIT et aucun bouton ; soi-même : rien', () => {
    expect(action({ kind: 'friend' })).toContain('Contact');
    expect(action({ kind: 'friend' })).not.toContain('<button');
    expect(action({ kind: 'blocked' })).toContain('Bloqué');
    expect(action({ kind: 'blocked' })).not.toContain('<button');
    expect(action({ kind: 'self' })).toBe('');
  });
});

describe('les onglets', () => {
  test('trois onglets dans l’ordre d’iOS, l’actif se dit choisi', () => {
    const html = renderToStaticMarkup(<DiscoverTabBar language="fr" selected="requests" received={0} onSelect={noop} />);
    expect([...html.matchAll(/data-discover-tab="(\w+)"/g)].map((m) => m[1])).toEqual(['discover', 'requests', 'blocked']);
    expect(html).toMatch(/aria-selected="true"[^>]*data-discover-tab="requests"/);
    expect(html).not.toContain('data-discover-tab-count');
  });

  test('un seul onglet — le sélectionné — est dans l’ordre de tabulation (#6422)', () => {
    const html = renderToStaticMarkup(<DiscoverTabBar language="fr" selected="requests" received={0} onSelect={noop} />);
    expect(html).toMatch(/tabindex="-1"[^>]*data-discover-tab="discover"/);
    expect(html).toMatch(/tabindex="0"[^>]*data-discover-tab="requests"/);
    expect(html).toMatch(/tabindex="-1"[^>]*data-discover-tab="blocked"/);
  });

  test('« Demandes » porte le compte des reçues et l’annonce ; au-delà de 99, « 99+ »', () => {
    const three = renderToStaticMarkup(<DiscoverTabBar language="fr" selected="discover" received={3} onSelect={noop} />);
    expect(three).toContain('data-discover-tab-count="3"');
    expect(three).toContain('aria-label="Demandes, 3 reçues"');
    expect(discoverTabLabel('fr', 'requests', 1)).toBe('Demandes, 1 reçue');
    expect(discoverTabLabel('en', 'requests', 120)).toBe('Requests, 99+ received');
    expect(discoverTabLabel('fr', 'blocked', 3)).toBe('Bloqués');
  });

  test('l’en-tête : un retour nommé et le titre « Découvrir »', () => {
    const html = renderToStaticMarkup(<DiscoverHeader language="fr" />);
    expect(html).toContain('aria-label="Revenir aux conversations"');
    expect(html).toContain('Découvrir');
  });
});

describe('les lignes de demandes et de bloqués', () => {
  test('une demande reçue sans message dit l’intention, et porte son heure', () => {
    const html = renderToStaticMarkup(<ReceivedRequestRow language="fr" request={request()} now={NOW} onAccept={noop} onReject={noop} />);
    expect(html).toContain('Souhaite entrer en contact avec vous');
    expect(html).toMatch(/datetime="2026-09-13T09:00:00.000Z"/i);
    const withMessage = renderToStaticMarkup(<ReceivedRequestRow language="fr" request={request({ message: 'On se connaît !' })} now={NOW} onAccept={noop} onReject={noop} />);
    expect(withMessage).toContain('On se connaît !');
    expect(withMessage).not.toContain('Souhaite entrer en contact');
  });

  test('une demande envoyée montre le DESTINATAIRE et son annulation nommée', () => {
    const sent = request({ senderId: 'u-me', receiverId: 'u-grace', sender: wirePerson({ id: 'u-me', displayName: 'Moi' }), receiver: wirePerson({ id: 'u-grace', displayName: 'Grace Hopper' }) });
    const html = renderToStaticMarkup(<SentRequestRow language="fr" request={sent} now={NOW} onCancel={noop} />);
    expect(html).toContain('Grace Hopper');
    expect(html).not.toContain('>Moi<');
    expect(html).toContain('aria-label="Annuler la demande envoyée à Grace Hopper"');
  });

  test('débloquer nomme la personne', () => {
    expect(renderToStaticMarkup(<BlockedPersonRow language="fr" person={ada} onUnblock={noop} />)).toContain('aria-label="Débloquer Ada Lovelace"');
  });
});

describe('inviter par e-mail', () => {
  const card = (status: Parameters<typeof InviteCard>[0]['status']) =>
    renderToStaticMarkup(<InviteCard language="fr" email="" sentTo="ada@example.org" status={status} onEmailChange={noop} onSubmit={noop} />);

  test('l’envoi réussi se dit en statut ; un refus se dit en alerte, sous le champ', () => {
    expect(card('sent')).toMatch(/role="status"[^>]*>Invitation envoyée à ada@example.org</);
    expect(card('conflict')).toMatch(/role="alert"[^>]*>Cette personne est déjà sur Meeshy/);
    expect(card('invalid')).toContain('aria-invalid="true"');
    expect(card('idle')).not.toContain('data-discover-invite-feedback');
  });

  test('« Envoyer » reste inerte tant qu’aucune adresse n’est saisie', () => {
    expect(card('idle')).toMatch(/disabled=""[^>]*data-discover-invite-send|data-discover-invite-send[^>]*disabled=""/);
  });
});

describe('hors ligne (#6419)', () => {
  test('sur un cache non vide, la liste reste et le dit', () => {
    expect(renderToStaticMarkup(<DiscoverOfflineNotice language="fr" cold={false} />)).toContain('Vous voyez la liste du dernier chargement.');
  });

  test('à cache FROID, l’annonce ne promet aucune liste déjà chargée', () => {
    const html = renderToStaticMarkup(<DiscoverOfflineNotice language="fr" cold />);
    expect(html).toContain('role="status"');
    expect(html).toContain('La liste se chargera dès le retour du réseau.');
    expect(html).not.toContain('dernier chargement');
  });
});

/**
 * LES FLÈCHES DU TABLIST (#6422) — `role="tablist"`/`role="tab"` promettent
 * au clavier le motif WAI-ARIA « Tabs » ; sans DOM réel, aucun témoin ne peut
 * observer le focus qui se déplace (`renderToStaticMarkup` n'a pas de
 * `document`). Patron `message-menu.test.tsx` (happy-dom + `createRoot` +
 * `act`), scopé à ce bloc seulement.
 */
describe('DiscoverTabBar — les flèches du clavier (#6422)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function Harness({ language, initial }: { readonly language: 'fr' | 'ar'; readonly initial: DiscoverTab }) {
    const [selected, setSelected] = useState<DiscoverTab>(initial);
    return <DiscoverTabBar language={language} selected={selected} received={0} onSelect={setSelected} />;
  }

  const mount = (language: 'fr' | 'ar' = 'fr', initial: DiscoverTab = 'discover') => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness language={language} initial={initial} />);
    });
    return container;
  };

  const tab = (name: DiscoverTab): HTMLElement => {
    const el = document.querySelector<HTMLElement>(`[data-discover-tab="${name}"]`);
    if (el === null) throw new Error(`aucun onglet « ${name} »`);
    return el;
  };

  const press = (el: HTMLElement, key: string) => {
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
    });
  };

  test('ArrowRight avance d’un onglet et le sélectionne', () => {
    mount();
    act(() => tab('discover').focus());
    press(tab('discover'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('requests'));
    expect(tab('requests').getAttribute('aria-selected')).toBe('true');
  });

  test('ArrowLeft depuis le premier onglet boucle sur le dernier', () => {
    mount();
    act(() => tab('discover').focus());
    press(tab('discover'), 'ArrowLeft');
    expect(document.activeElement).toBe(tab('blocked'));
  });

  test('End puis Home vont au dernier puis au premier onglet', () => {
    mount();
    act(() => tab('discover').focus());
    press(tab('discover'), 'End');
    expect(document.activeElement).toBe(tab('blocked'));
    press(tab('blocked'), 'Home');
    expect(document.activeElement).toBe(tab('discover'));
  });

  test('en arabe, les flèches s’inversent : ArrowLeft avance', () => {
    mount('ar');
    act(() => tab('discover').focus());
    press(tab('discover'), 'ArrowLeft');
    expect(document.activeElement).toBe(tab('requests'));
    press(tab('requests'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('discover'));
  });

  test('un seul onglet est dans l’ordre de tabulation, y compris après un déplacement', () => {
    mount();
    act(() => tab('discover').focus());
    press(tab('discover'), 'ArrowRight');
    expect(tab('requests').tabIndex).toBe(0);
    expect(tab('discover').tabIndex).toBe(-1);
    expect(tab('blocked').tabIndex).toBe(-1);
  });
});
