import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { decodeFriendRequest, decodePerson, type FriendRequestRecord, type PersonSummary } from '@/lib/api/friend-requests';
import type { Relationship } from '@/lib/discover/view';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import {
  BlockedPersonRow,
  ConnectionAction,
  DiscoverHeader,
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
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en')]);
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
