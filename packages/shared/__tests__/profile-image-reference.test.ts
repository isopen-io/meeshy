import { describe, expect, it } from 'vitest';

import { isProfileImageReference, profileImageStorageKey } from '../utils/profile-image-reference';
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

/**
 * La branche `/api/` court-circuitait toute la règle (#16810) : `/api/../../x`
 * ou n'importe quelle route GET de la passerelle passait comme avatar ou
 * bannière, de profil comme de communauté. Elle n'admet plus que la route de
 * FLUX des pièces jointes (versionnée ou legacy), dont la clé — souvent
 * percent-encodée, `apiPath('/attachments/file/<encodeURIComponent(clé)>')`
 * l'a gravée ainsi jusqu'au 2026-09-16 — suit la loi du chemin de stockage
 * une fois décodée.
 */
describe('isProfileImageReference — la branche /api/ (#16810)', () => {
  it('admet la route de flux des pièces jointes, versionnée, legacy ou à clé encodée', () => {
    expect(isProfileImageReference('/api/v1/attachments/file/2026/09/a.png')).toBe(true);
    expect(isProfileImageReference('/api/attachments/file/2026/09/a.png')).toBe(true);
    expect(isProfileImageReference(`/api/v1/attachments/file/${encodeURIComponent(TELEVERSE)}`)).toBe(true);
  });

  it('refuse la remontée de dossier, en clair comme encodée', () => {
    expect(isProfileImageReference('/api/../../etc/passwd')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file/../../etc/passwd')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file/2026%2F..%2F..%2Fetc%2Fpasswd')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file/%2e%2e/secret')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file/%252e%252e/secret')).toBe(false);
  });

  it('refuse toute autre route de la passerelle', () => {
    expect(isProfileImageReference('/api/v1/users/me')).toBe(false);
    expect(isProfileImageReference('/api/v1/auth/logout')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/6ab8a0386ca26324f11c92c5')).toBe(false);
    expect(isProfileImageReference('/api/v1/admin/users/x/profile-images/avatar')).toBe(false);
  });

  it('refuse une clé vide, une requête, un fragment ou un encodage illisible', () => {
    expect(isProfileImageReference('/api/v1/attachments/file/')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file/a.png?next=/api/v1/auth/logout')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file/a.png#x')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file/%E0%A4%A')).toBe(false);
    expect(isProfileImageReference('/api/v1/attachments/file//etc/passwd')).toBe(false);
  });
});

describe('profileImageStorageKey — le fichier du volume qu’une image d’identité désigne (#16811)', () => {
  it('rend le chemin de stockage relatif tel quel', () => {
    expect(profileImageStorageKey(TELEVERSE)).toBe(TELEVERSE);
  });

  it('rend la clé DÉCODÉE de la route de flux, montée v1 ou legacy', () => {
    expect(profileImageStorageKey(`/api/v1/attachments/file/${encodeURIComponent(TELEVERSE)}`)).toBe(TELEVERSE);
    expect(profileImageStorageKey(`/api/attachments/file/${TELEVERSE}`)).toBe(TELEVERSE);
  });

  it('rend la clé d’une adresse ABSOLUE dont le chemin est la route de flux, quel que soit l’hôte', () => {
    expect(profileImageStorageKey(`https://gate.meeshy.me/api/v1/attachments/file/${encodeURIComponent(TELEVERSE)}`)).toBe(TELEVERSE);
    expect(profileImageStorageKey(`http://autre.example/api/attachments/file/${TELEVERSE}`)).toBe(TELEVERSE);
  });

  it('rend null pour un hôte tiers ou une forme refusée', () => {
    expect(profileImageStorageKey('https://cdn.example.com/a.png')).toBeNull();
    expect(profileImageStorageKey('/api/v1/static/banner.jpg')).toBeNull();
    expect(profileImageStorageKey('/api/v1/attachments/file/%2e%2e/x.png')).toBeNull();
    expect(profileImageStorageKey('data:image/png;base64,AAAA')).toBeNull();
  });
});
