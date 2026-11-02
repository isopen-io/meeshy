import { beforeAll, describe, expect, test } from 'bun:test';

import { GlobalUserRole } from '@meeshy/shared/types/role-types';
import { mayReadWorldParticipantCard, type WorldParticipantCard } from '@meeshy/shared/types/world-participant-card';

import { loadWorldParticipantCardCatalog, translateWorldParticipantCard } from '../i18n-world-participant-card-catalog';

import { mayOpenWorldParticipantCard, opensWorldParticipantCards } from './world-participant-card-access';
import { worldParticipantCardView, type WorldParticipantCardView } from './world-participant-card-view';

/**
 * QUI OUVRE LA FICHE D'UN PARTICIPANT DE WORLD WIDE, ET CE QU'ELLE DIT
 * (#10102, partie web).
 *
 * La loi d'accès du client est la JUMELLE de `mayReadWorldParticipantCard`
 * (`@meeshy/shared/types/world-participant-card`) : ce module partagé construit
 * ses schémas Zod au niveau module, et l'importer depuis le fil ferait entrer
 * `zod` complet dans le chunk de l'écran pour une comparaison de rangs. Le
 * témoin la confronte rôle par rôle — elle ne peut pas dériver en silence.
 */

const ROLES: readonly (string | null | undefined)[] = [
  ...Object.values(GlobalUserRole),
  'admin',
  'Moderator',
  'analyst',
  'user',
  'AGENT',
  'agent',
  'ROOT',
  '',
  ' ',
  null,
  undefined,
];

describe('mayOpenWorldParticipantCard — jumelle de la loi partagée', () => {
  test('rend, rôle par rôle, exactement ce que rend la loi de la passerelle', () => {
    for (const role of ROLES) {
      expect({ role, opens: mayOpenWorldParticipantCard(role) }).toEqual({ role, opens: mayReadWorldParticipantCard(role) });
    }
  });

  test('l’équipe ouvre, personne d’autre', () => {
    expect(['ANALYST', 'AUDIT', 'MODERATOR', 'ADMIN', 'BIGBOSS'].map(mayOpenWorldParticipantCard)).toEqual([true, true, true, true, true]);
    expect(['USER', 'AGENT', 'INCONNU', null].map(mayOpenWorldParticipantCard)).toEqual([false, false, false, false]);
  });
});

describe('opensWorldParticipantCards — seulement dans World Wide, seulement pour l’équipe', () => {
  test('World Wide et un rôle d’équipe ⇒ oui', () => {
    expect(opensWorldParticipantCards({ conversationIdentifier: 'world', role: 'MODERATOR' })).toBe(true);
  });

  test('toute autre conversation ⇒ non, même pour BIGBOSS', () => {
    expect(opensWorldParticipantCards({ conversationIdentifier: 'mshy_amis', role: 'BIGBOSS' })).toBe(false);
    expect(opensWorldParticipantCards({ conversationIdentifier: null, role: 'BIGBOSS' })).toBe(false);
    expect(opensWorldParticipantCards({ conversationIdentifier: undefined, role: 'BIGBOSS' })).toBe(false);
  });

  test('un USER, un rôle encore inconnu (non lu) ou absent ⇒ non', () => {
    expect(opensWorldParticipantCards({ conversationIdentifier: 'world', role: 'USER' })).toBe(false);
    expect(opensWorldParticipantCards({ conversationIdentifier: 'world', role: null })).toBe(false);
  });
});

const guestCard = (overrides: Partial<WorldParticipantCard> = {}): WorldParticipantCard => ({
  participantId: '66f0a1b2c3d4e5f6a7b8c9d0',
  participantType: 'anonymous',
  displayName: 'Awa',
  avatar: null,
  username: null,
  conversationRole: 'member',
  accountRole: null,
  languages: { conversation: 'fr', system: null, regional: null, customDestination: null, deviceLocale: null },
  country: 'SN',
  client: { browser: 'Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile', platform: null, appVersion: null },
  joinedAt: '2026-10-11T08:00:00.000Z',
  shareLink: { identifier: 'mshy_world', linkId: '66f0a1b2c3d4e5f6a7b8c9d1', name: 'World Wide' },
  status: 'active',
  accountDetailsWithheld: false,
  ...overrides,
});

const accountCard = (overrides: Partial<WorldParticipantCard> = {}): WorldParticipantCard =>
  guestCard({
    participantType: 'user',
    displayName: 'Nour Haddad',
    username: 'nour',
    accountRole: 'MODERATOR',
    languages: { conversation: 'ar', system: 'ar', regional: 'en', customDestination: null, deviceLocale: 'fr-FR' },
    client: { browser: 'Chrome', browserVersion: '129', os: 'Windows', osVersion: '10', deviceType: null, platform: 'web', appVersion: '2.0.4' },
    shareLink: null,
    ...overrides,
  });

beforeAll(async () => {
  await loadWorldParticipantCardCatalog('fr');
});

const viewOf = (card: WorldParticipantCard): WorldParticipantCardView =>
  worldParticipantCardView(card, { language: 'fr', t: (key) => translateWorldParticipantCard('fr', key) });

const row = (view: WorldParticipantCardView, id: string) => view.sections.flatMap((section) => section.rows).find((candidate) => candidate.id === id);
const rowIds = (view: WorldParticipantCardView) => view.sections.flatMap((section) => section.rows.map((candidate) => candidate.id));

describe('worldParticipantCardView — ce que la fiche montre d’un INVITÉ', () => {
  test('l’en-tête dit « Anonyme », jamais un pseudo inventé', () => {
    const view = viewOf(guestCard());
    expect(view.header).toEqual({ name: 'Awa', handle: null, kind: 'anonymous', kindLabel: 'Anonyme', initials: 'AW', avatar: null });
  });

  test('pays avec son drapeau, nommé dans la langue d’interface', () => {
    expect(row(viewOf(guestCard()), 'country')).toMatchObject({ value: 'Sénégal', leading: '🇸🇳' });
  });

  test('navigateur, système et appareil, versions majeures', () => {
    const view = viewOf(guestCard());
    expect(row(view, 'browser')?.value).toBe('Safari 17');
    expect(row(view, 'system')?.value).toBe('iOS 17');
    expect(row(view, 'device')?.value).toBe('Mobile');
  });

  test('la langue d’entrée, nommée et marquée de son drapeau ; aucun rang de compte pour un invité', () => {
    const view = viewOf(guestCard());
    expect(row(view, 'language.conversation')).toMatchObject({ value: 'français', leading: '🇫🇷' });
    expect(rowIds(view)).not.toContain('language.system');
    expect(rowIds(view)).not.toContain('accountRole');
    expect(rowIds(view)).not.toContain('app');
  });

  test('le lien d’entrée, la date d’arrivée, le rôle et le statut', () => {
    const view = viewOf(guestCard());
    expect(row(view, 'link')?.value).toBe('World Wide');
    expect(row(view, 'link')?.detail).toBe('mshy_world');
    expect(row(view, 'conversationRole')?.value).toBe('Membre');
    expect(row(view, 'status')?.value).toBe('Présent');
    expect(row(view, 'joinedAt')?.value).toContain('2026');
  });

  test('un invité entré avant le relevé du poste : « Non relevé », jamais un trou', () => {
    const view = viewOf(guestCard({ client: null, country: null }));
    expect(row(view, 'client')).toMatchObject({ value: 'Non relevé', tone: 'missing' });
    expect(row(view, 'country')).toMatchObject({ value: 'Non relevé', tone: 'missing' });
    expect(view.withheldNotice).toBeNull();
  });

  test('ajouté sans lien ⇒ la ligne le dit', () => {
    expect(row(viewOf(guestCard({ shareLink: null })), 'link')?.value).toBe('Ajouté sans lien');
  });
});

describe('worldParticipantCardView — ce que la fiche montre d’un COMPTE', () => {
  test('l’en-tête porte le pseudo et « Compte Meeshy »', () => {
    expect(viewOf(accountCard()).header).toEqual({ name: 'Nour Haddad', handle: '@nour', kind: 'account', kindLabel: 'Compte Meeshy', initials: 'NH', avatar: null });
  });

  test('le rôle du compte, les rangs du Prisme renseignés, l’application déclarée', () => {
    const view = viewOf(accountCard());
    expect(row(view, 'accountRole')?.value).toBe('Modérateur');
    expect(row(view, 'language.system')).toMatchObject({ value: 'arabe' });
    expect(row(view, 'language.regional')).toMatchObject({ value: 'anglais' });
    expect(rowIds(view)).not.toContain('language.customDestination');
    expect(row(view, 'language.deviceLocale')?.value).toContain('français');
    expect(row(view, 'app')?.value).toBe('web · 2.0.4');
    expect(row(view, 'device')?.value).toBe('Non relevé');
  });

  test('des détails RETENUS se disent « Retenu », jamais « Non relevé »', () => {
    const view = viewOf(
      accountCard({
        accountDetailsWithheld: true,
        accountRole: null,
        client: null,
        country: null,
        languages: { conversation: 'ar', system: null, regional: null, customDestination: null, deviceLocale: null },
      }),
    );
    expect(row(view, 'accountRole')).toMatchObject({ tone: 'withheld' });
    expect(row(view, 'client')).toMatchObject({ tone: 'withheld' });
    expect(row(view, 'country')).toMatchObject({ tone: 'withheld' });
    expect(row(view, 'language.account')).toMatchObject({ tone: 'withheld' });
    expect(row(view, 'language.conversation')?.value).toBe('arabe');
    expect(view.withheldNotice).not.toBeNull();
  });

  test('un pays d’arrivée reste servi quand le reste est retenu', () => {
    const view = viewOf(accountCard({ accountDetailsWithheld: true, accountRole: null, client: null, country: 'MA' }));
    expect(row(view, 'country')?.leading).toBe('🇲🇦');
    expect(row(view, 'country')?.tone).toBeUndefined();
  });

  test('un rôle de conversation ou de compte inconnu de ce client s’affiche tel quel', () => {
    const view = viewOf(accountCard({ conversationRole: 'curator', accountRole: 'GUARDIAN' }));
    expect(row(view, 'conversationRole')?.value).toBe('curator');
    expect(row(view, 'accountRole')?.value).toBe('GUARDIAN');
  });
});

describe('worldParticipantCardView — le visage de l’en-tête (#12571)', () => {
  test('la photo servie est portée par l’en-tête', () => {
    expect(viewOf(guestCard({ avatar: '2026/09/awa/photo.png' })).header.avatar).toBe('2026/09/awa/photo.png');
  });

  test('sans photo, l’en-tête n’en porte aucune : les initiales servent', () => {
    expect(viewOf(guestCard()).header.avatar).toBeNull();
  });
});
