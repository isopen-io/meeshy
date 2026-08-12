import { getOrCreateWebSessionKey } from '../anonymous-session';

describe('getOrCreateWebSessionKey', () => {
  beforeEach(() => localStorage.clear());

  it('réutilise le session_token anonyme existant', () => {
    localStorage.setItem('session_token', 'real-anon-token');
    expect(getOrCreateWebSessionKey()).toBe('real-anon-token');
    expect(localStorage.getItem('meeshy_session_token')).toBeNull();
  });

  it('génère et persiste un meeshy_session_token stable si aucune session', () => {
    const first = getOrCreateWebSessionKey();
    expect(first).toBeTruthy();
    expect(localStorage.getItem('meeshy_session_token')).toBe(first);
    expect(getOrCreateWebSessionKey()).toBe(first); // stable entre appels
  });
});
