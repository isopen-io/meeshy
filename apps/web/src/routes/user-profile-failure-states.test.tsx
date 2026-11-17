import { describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';
import { PROFILE_FAILURES, type ProfileFailure } from '@/lib/profile/failure';

import { ProfileFailureNotice, ProfileOfflineBanner } from './user-profile-states';

const { mount, act } = kitMount();

const noticeOf = (failure: ProfileFailure, onRetry: () => void = () => {}, onSearch: () => void = () => {}) =>
  mount(<ProfileFailureNotice language="fr" failure={failure} onRetry={onRetry} onSearch={onSearch} />);

const buttons = (el: Element): readonly HTMLButtonElement[] => Array.from(el.querySelectorAll('button'));

describe('les états d’échec du profil sont des blocs d’état du kit (#18882)', () => {
  test('chaque échec se peint par le bloc d’état, avec le genre qui lui revient', () => {
    const kinds = PROFILE_FAILURES.map((failure) => noticeOf(failure).querySelector('[data-kit-state-block]')?.getAttribute('data-kind'));
    expect(kinds).toEqual(['denied', 'error', 'offline', 'error']);
  });

  test('introuvable et privé : « Chercher quelqu’un » est la sortie, jamais « Réessayer »', () => {
    let searched = 0;
    const el = noticeOf('refused', () => {}, () => {
      searched += 1;
    });
    const labels = buttons(el).map((button) => button.textContent?.trim());
    expect(labels).toEqual(['Chercher quelqu’un']);
    act(() => buttons(el)[0]?.click());
    expect(searched).toBe(1);
  });

  test('une erreur et un débit gardent « Réessayer », qui rejoue la demande', () => {
    const retried = (['error', 'throttled'] as const).map((failure) => {
      let count = 0;
      const el = noticeOf(failure, () => {
        count += 1;
      });
      act(() => buttons(el)[0]?.click());
      return count;
    });
    expect(retried).toEqual([1, 1]);
  });

  test('hors ligne sans cache : aucun geste qui mentirait', () => {
    expect(buttons(noticeOf('offline'))).toHaveLength(0);
  });

  test('le refus garde son texte et ne dit pas « introuvable »', () => {
    const text = noticeOf('refused').textContent ?? '';
    expect(text).toContain('Ce profil n’est pas accessible');
    expect(text.toLowerCase()).not.toContain('introuvable');
  });
});

describe('hors ligne sur un cache : le bandeau dit ce qu’on voit et son âge (#18882)', () => {
  test('avec une date de mise à jour, « dernière version connue » et son âge', () => {
    const now = Date.parse('2026-11-17T12:00:00Z');
    const el = mount(<ProfileOfflineBanner language="fr" updatedAt={now - 18 * 60_000} now={now} />);
    const text = el.textContent ?? '';
    expect(text).toContain('dernière version connue');
    expect(text).toContain('18 min');
    expect(text).not.toContain('à la reconnexion');
  });

  test('sans date, le bandeau garde sa phrase d’attente', () => {
    const el = mount(<ProfileOfflineBanner language="fr" />);
    expect(el.textContent ?? '').toContain('à la reconnexion');
  });
});
