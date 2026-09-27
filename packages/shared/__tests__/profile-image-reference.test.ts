import { describe, expect, it } from 'vitest';

import { updateAvatarSchema, updateBannerSchema } from '../utils/validation';

/**
 * L'adresse qu'un TÉLÉVERSEMENT rend est un chemin de stockage RELATIF
 * (`2026/09/<id>/avatar_….png` — `UploadProcessor.getAttachmentPath`, mesuré
 * sur staging le 2026-09-27). `PATCH /users/me/avatar` et `/banner` n'acceptaient
 * que `http(s)://` ou `/api/…` : le web, qui pose l'adresse servie telle quelle
 * (`performImageUpdate`), recevait un 400 « Invalid image format » à chaque
 * changement de photo (#8217).
 */
const TELEVERSE = '2026/09/6ab8a0386ca26324f11c92c5/avatar_8443f156-68e7-4eab-b0b1-7c3999afa5e5.png';

describe.each([
  ['avatar', (value: string) => updateAvatarSchema.safeParse({ avatar: value }).success],
  ['banner', (value: string) => updateBannerSchema.safeParse({ banner: value }).success],
] as const)('%s — les références d’image acceptées', (_kind, accepte) => {
  it('accepte le chemin de stockage relatif rendu par un téléversement', () => {
    expect(accepte(TELEVERSE)).toBe(true);
  });

  it('accepte encore les formes absolues et les chemins d’API', () => {
    expect(accepte('https://cdn.meeshy.me/a.png')).toBe(true);
    expect(accepte('/api/v1/attachments/file/2026/09/a.png')).toBe(true);
  });

  it('refuse une donnée base64, un autre schéma, une remontée de dossier, un chemin protocole-relatif', () => {
    expect(accepte('data:image/png;base64,AAAA')).toBe(false);
    expect(accepte('javascript:alert(1)')).toBe(false);
    expect(accepte('2026/../../etc/passwd')).toBe(false);
    expect(accepte('//evil.example/a.png')).toBe(false);
    expect(accepte('')).toBe(false);
  });
});
