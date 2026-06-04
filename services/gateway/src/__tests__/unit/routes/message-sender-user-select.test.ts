import { messageSenderUserSelect } from '../../../routes/conversations/messages';

/**
 * T16 — over-fetch trim regression guard for the GET messages sender.user
 * select. The response schema (messageSenderSchema) strips the nested user
 * object, so only the fields the handler derives the top-level sender from
 * should be fetched.
 */
describe('messageSenderUserSelect (T16 over-fetch trim)', () => {
  it('keeps the fields the response derives its top-level sender from', () => {
    expect(messageSenderUserSelect.id).toBe(true);
    expect(messageSenderUserSelect.username).toBe(true);
    expect(messageSenderUserSelect.displayName).toBe(true);
    expect(messageSenderUserSelect.avatar).toBe(true);
  });

  it('does NOT fetch firstName / lastName / systemLanguage / role — read by no client, and the response schema never exposes them', () => {
    const select = messageSenderUserSelect as Record<string, unknown>;
    for (const field of ['firstName', 'lastName', 'systemLanguage', 'role']) {
      expect(field in select).toBe(false);
    }
  });
});
