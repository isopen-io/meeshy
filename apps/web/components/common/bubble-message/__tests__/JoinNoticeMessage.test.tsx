/**
 * L'avis d'arrivée est une NOTICE, pas un message.
 *
 * Sans rendu dédié, « Bob a rejoint la conversation » s'afficherait comme une
 * bulle ordinaire signée Bob : avatar, heure, réactions, réponse — l'attirail
 * complet d'une prise de parole que Bob n'a pas eue. Le fil raconterait que le
 * premier mot de chaque arrivant est l'annonce de sa propre arrivée.
 *
 * Le rendu se prend sur `metadata`, jamais sur le texte : `content` n'est qu'un
 * repli français, et le Prisme Linguistique veut que le lecteur voie sa langue.
 * Même contrat que `CallSystemMessage`.
 *
 * Le fantôme n'est pas décoratif. C'est ici que la distinction compte le plus :
 * une conversation ouverte par lien public voit entrer des gens sans compte, et
 * les présents doivent le savoir au moment de l'entrée, pas à la relecture.
 */

import { render, screen } from '@testing-library/react';
import { JoinNoticeMessage } from '../JoinNoticeMessage';
import { JOIN_NOTICE_KIND } from '@meeshy/shared/utils/join-notice';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) =>
      typeof params === 'object' && params
        ? `${key}:${Object.values(params).join(',')}`
        : key,
  }),
}));

const notice = (overrides: Record<string, unknown> = {}) => ({
  kind: JOIN_NOTICE_KIND,
  participantId: 'p1',
  displayName: 'ano_bob_sm123',
  isAnonymous: true,
  viaShareLink: true,
  ...overrides,
});

describe('JoinNoticeMessage', () => {
  it('nomme l’arrivant', () => {
    render(<JoinNoticeMessage metadata={notice() as never} />);

    expect(screen.getByTestId('join-notice').textContent).toContain('ano_bob_sm123');
  });

  // Le nom DONNÉ prime, le pseudo `ano_…` descend en @handle — chacun à sa
  // place. Sans nom donné, le pseudo reste le nom principal et le handle
  // disparaît : « ano_bob » suivi de « @ano_bob » ne dirait rien de plus.
  it('met le nom donné en premier et le pseudo en @handle', () => {
    render(
      <JoinNoticeMessage
        metadata={notice({ givenName: 'Bob Martin', username: 'ano_bob_sm123' }) as never}
      />
    );

    expect(screen.getByTestId('join-notice').textContent).toContain('Bob Martin');
    expect(screen.getByTestId('join-notice-handle').textContent).toBe('@ano_bob_sm123');
  });

  it('sans nom donné, aucun handle redondant', () => {
    render(<JoinNoticeMessage metadata={notice({ username: 'ano_bob_sm123' }) as never} />);

    expect(screen.queryByTestId('join-notice-handle')).toBeNull();
  });

  it('marque d’un fantôme celui qui n’a pas de compte', () => {
    const { container } = render(<JoinNoticeMessage metadata={notice() as never} />);

    expect(container.querySelector('[data-testid="ghost-icon"]')).not.toBeNull();
  });

  it('le DIT aussi en toutes lettres — un glyphe seul ne se lit pas', () => {
    render(<JoinNoticeMessage metadata={notice() as never} />);

    expect(screen.getByTestId('join-notice-no-account')).toBeTruthy();
  });

  it('CONTRE-ÉPREUVE — un inscrit n’a ni fantôme ni mention', () => {
    const { container } = render(
      <JoinNoticeMessage metadata={notice({ isAnonymous: false, displayName: 'Alice' }) as never} />
    );

    expect(container.querySelector('[data-testid="ghost-icon"]')).toBeNull();
    expect(screen.queryByTestId('join-notice-no-account')).toBeNull();
  });

  it('ne signe pas la notice — elle n’a ni auteur ni heure, ce n’est pas une prise de parole', () => {
    const { container } = render(<JoinNoticeMessage metadata={notice() as never} />);

    expect(container.querySelector('time')).toBeNull();
    expect(container.querySelector('a[href^="/u/"]')).toBeNull();
  });

  it('passe par le catalogue plutôt que par un texte figé', () => {
    render(<JoinNoticeMessage metadata={notice({ isAnonymous: false, displayName: 'Alice' }) as never} />);

    expect(screen.getByTestId('join-notice').textContent).toContain('joinNotice.joined');
  });
});
