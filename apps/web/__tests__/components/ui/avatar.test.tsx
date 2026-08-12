/**
 * AvatarImage — resolution centralisee des URLs de media (avatar/banniere).
 *
 * Contexte : en production, `User.avatar`/`User.banner` (et les avatars de
 * conversation) peuvent etre des chemins RELATIFS renvoyes par l'API
 * (`/api/v1/attachments/file/...`). Le frontend tourne sur meeshy.me, l'API
 * sur gate.meeshy.me : injecter le chemin relatif tel quel dans un <img src>
 * le resout contre meeshy.me → 404 systematique.
 *
 * `AvatarImage` (wrapper partage par ~50 points d'affichage dans l'app)
 * resout desormais `src` via `buildAttachmentUrl` avant de le transmettre a
 * Radix — un point de passage unique au lieu de prefixer individuellement
 * chaque appelant.
 *
 * Radix `Avatar.Image` ne rend son <img> qu'apres un evenement de chargement
 * (non simule par jsdom) : on mocke `@radix-ui/react-avatar` en composants
 * passthrough pour tester uniquement la logique de resolution de `src`.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { Avatar, AvatarImage } from '@/components/ui/avatar';

jest.mock('@radix-ui/react-avatar', () => ({
  __esModule: true,
  Root: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  Image: ({ ...props }: Record<string, unknown>) => <img alt="" {...props} />,
  Fallback: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  ),
}));

describe('AvatarImage media URL resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://gate.meeshy.me';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('prefixes a relative attachment path with the API origin', () => {
    const { getByAltText } = render(
      <Avatar>
        <AvatarImage src="/api/v1/attachments/file/2026%2F07%2Fu1/avatar_640w.webp" alt="user" />
      </Avatar>
    );

    expect(getByAltText('user')).toHaveAttribute(
      'src',
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F07%2Fu1/avatar_640w.webp'
    );
  });

  it('leaves an already-absolute URL unchanged', () => {
    const { getByAltText } = render(
      <Avatar>
        <AvatarImage src="https://cdn.example.com/pic.jpg" alt="external" />
      </Avatar>
    );

    expect(getByAltText('external')).toHaveAttribute('src', 'https://cdn.example.com/pic.jpg');
  });

  it('passes a data: URI through untouched (no attachment prefixing)', () => {
    const dataUri = 'data:image/png;base64,AAAA';
    const { getByAltText } = render(
      <Avatar>
        <AvatarImage src={dataUri} alt="local-preview" />
      </Avatar>
    );

    expect(getByAltText('local-preview')).toHaveAttribute('src', dataUri);
  });

  it('passes an undefined src through without throwing', () => {
    const { getByAltText } = render(
      <Avatar>
        <AvatarImage src={undefined} alt="no-avatar" />
      </Avatar>
    );

    expect(getByAltText('no-avatar')).not.toHaveAttribute('src');
  });
});
