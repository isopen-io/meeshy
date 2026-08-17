import { buildShareLinkPath, buildShareLinkUrl } from '../share-link-url';

describe('buildShareLinkPath — /chat est l’URL canonique du partage', () => {
  it('points at the conversation, not at the retired join page', () => {
    expect(buildShareLinkPath('mshy_abc_123')).toBe('/chat/mshy_abc_123');
  });
});

describe('buildShareLinkUrl', () => {
  it('uses the given origin', () => {
    expect(buildShareLinkUrl('mshy_abc_123', 'https://meeshy.me')).toBe(
      'https://meeshy.me/chat/mshy_abc_123'
    );
  });

  // Un origin avec slash final produisait `//chat/...` — une URL différente
  // pour la même conversation.
  it('never doubles the slash when the origin ends with one', () => {
    expect(buildShareLinkUrl('mshy_abc_123', 'https://meeshy.me/')).toBe(
      'https://meeshy.me/chat/mshy_abc_123'
    );
  });

  it('falls back to window.location.origin in the browser', () => {
    expect(buildShareLinkUrl('mshy_abc_123')).toBe(
      `${window.location.origin}/chat/mshy_abc_123`
    );
  });
});
