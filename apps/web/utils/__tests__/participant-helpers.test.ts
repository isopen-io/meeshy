import { getParticipantDisplayName, getParticipantInitials } from '../participant-helpers';

describe('getParticipantDisplayName', () => {
  it('prefers displayName when set', () => {
    expect(
      getParticipantDisplayName({ displayName: 'Alice Martin', username: 'amartin_99' })
    ).toBe('Alice Martin');
  });

  it('trims a padded displayName (canonical resolver, not raw truthiness)', () => {
    expect(
      getParticipantDisplayName({ displayName: 'John ', username: 'bob' })
    ).toBe('John');
  });

  it('falls back past a whitespace-only displayName to the real name', () => {
    expect(
      getParticipantDisplayName({ displayName: '   ', firstName: 'Alice', lastName: 'Martin', username: 'amartin_99' })
    ).toBe('Alice Martin');
  });

  it('falls back to firstName + lastName when displayName is empty', () => {
    expect(
      getParticipantDisplayName({ displayName: '', firstName: 'Alice', lastName: 'Martin', username: 'amartin_99' })
    ).toBe('Alice Martin');
  });

  it('uses firstName alone when lastName is absent', () => {
    expect(
      getParticipantDisplayName({ firstName: 'Alice', username: 'amartin_99' })
    ).toBe('Alice');
  });

  it('falls back to username when no name parts are present', () => {
    expect(getParticipantDisplayName({ username: 'amartin_99' })).toBe('amartin_99');
  });

  it('produces a name consistent with the initials resolver for a whitespace displayName', () => {
    const user = { displayName: '   ', firstName: 'Bob', lastName: 'Obo', username: 'bobo' };
    // Both derive from the canonical trimmed resolver: name "Bob Obo" ⇒ initials "BO".
    expect(getParticipantDisplayName(user)).toBe('Bob Obo');
    expect(getParticipantInitials(user)).toBe('BO');
  });
});
