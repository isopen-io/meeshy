/**
 * La fiche d'un visiteur sans compte.
 *
 * Il a rempli un formulaire pour entrer, et rien de ce qu'il y a écrit n'était
 * lisible ensuite : les autres membres ne voyaient qu'un pseudo. Un participant
 * sans fiche est un participant qu'on ne peut ni reconnaître, ni accueillir, ni
 * modérer — et sur le web, où presque tout le monde arrive par invitation,
 * c'est le cas le plus courant, pas le cas limite.
 *
 * La carte rend DEUX CERCLES que le gateway a déjà séparés :
 *   - l'identité, visible de tout membre ;
 *   - les coordonnées, servies `null` à un membre ordinaire et accompagnées de
 *     `hasEmail` / `hasBirthday`. La carte doit alors dire « fourni, non
 *     visible » plutôt que « rien » : la nuance est ce qui distingue un
 *     visiteur qui a tout rempli d'un visiteur qui n'a rien donné.
 */

import { render, screen } from '@testing-library/react';
import { ParticipantProfileCard } from '../ParticipantProfileCard';
import type { ParticipantProfile } from '@/hooks/queries/use-participant-profile';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) =>
      typeof params === 'string' ? params : key,
  }),
}));

const profile = (overrides: Partial<ParticipantProfile> = {}): ParticipantProfile => ({
  participantId: 'p1',
  conversationId: 'c1',
  isAnonymous: true,
  userId: null,
  username: 'ano_bob_sm123',
  displayName: 'ano_bob_sm123',
  firstName: 'Bob',
  lastName: 'Smith',
  avatar: null,
  language: 'fr',
  country: 'FR',
  conversationRole: 'member',
  joinedAt: '2026-08-18T09:00:00Z',
  isOnline: true,
  lastActiveAt: '2026-08-18T10:00:00Z',
  shareLinkName: 'Invitation publique',
  hasEmail: true,
  hasBirthday: true,
  email: null,
  birthday: null,
  ...overrides,
});

describe('ParticipantProfileCard — identité', () => {
  it('rend le nom fourni à l’entrée', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-name').textContent).toContain('Bob Smith');
  });

  it('rend le pseudo', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-username').textContent).toContain('ano_bob_sm123');
  });

  it('marque d’un fantôme celui qui n’a pas de compte', () => {
    const { container } = render(<ParticipantProfileCard profile={profile()} />);

    expect(container.querySelector('[data-testid="ghost-icon"]')).not.toBeNull();
  });

  it('le dit aussi en toutes lettres', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-no-account')).toBeTruthy();
  });

  it('CONTRE-ÉPREUVE — un inscrit n’a ni fantôme ni mention', () => {
    const { container } = render(
      <ParticipantProfileCard profile={profile({ isAnonymous: false, userId: 'u1', username: 'alice' })} />
    );

    expect(container.querySelector('[data-testid="ghost-icon"]')).toBeNull();
    expect(screen.queryByTestId('participant-profile-no-account')).toBeNull();
  });

  it('nomme le lien emprunté et date l’arrivée', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-link').textContent).toContain('Invitation publique');
    expect(screen.getByTestId('participant-profile-joined')).toBeTruthy();
  });

  it('rend la langue déclarée — elle décide de ce que la personne lit', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-language')).toBeTruthy();
  });
});

describe('ParticipantProfileCard — coordonnées', () => {
  it('affiche l’email quand le lecteur a le droit de le voir', () => {
    render(<ParticipantProfileCard profile={profile({ email: 'bob@example.com' })} />);

    expect(screen.getByTestId('participant-profile-email').textContent).toContain('bob@example.com');
  });

  it('dit « fourni, non visible » plutôt que rien à un membre ordinaire', () => {
    render(<ParticipantProfileCard profile={profile({ email: null, hasEmail: true })} />);

    const row = screen.getByTestId('participant-profile-email');
    expect(row.textContent).not.toContain('bob@example.com');
    expect(row.getAttribute('data-withheld')).toBe('true');
  });

  it('n’affiche AUCUNE ligne quand rien n’a été fourni — ne rien promettre', () => {
    render(<ParticipantProfileCard profile={profile({ email: null, hasEmail: false })} />);

    expect(screen.queryByTestId('participant-profile-email')).toBeNull();
  });

  it('applique la même règle à la date de naissance', () => {
    render(<ParticipantProfileCard profile={profile({ hasBirthday: false })} />);

    expect(screen.queryByTestId('participant-profile-birthday')).toBeNull();
  });
});
