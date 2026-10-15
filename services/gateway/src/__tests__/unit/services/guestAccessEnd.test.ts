/**
 * #10457 — UN ordre de cause pour la fin d'accès d'un invité, sur toutes ses
 * portes : la connexion socket (`AuthHandler`), le REST (`middleware/auth.ts`),
 * la relecture du minuteur (`guestLinkWatch.ts`) et le rafraîchissement
 * (`refreshGuestSession`). Le lien expiré d'abord — c'est la cause première
 * quand le balayage désactive les invités d'un lien échu —, puis la
 * participation morte (désactivée ou bannie). Avant, la connexion et le REST
 * jugeaient la participation d'abord et la relecture le lien d'abord : le même
 * invité lisait « accès retiré » ou « lien expiré » selon le chemin.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { guestAccessEnd } from '../../../services/guestAccessEnd';

const NOW = new Date('2026-10-13T10:00:00Z');
const PAST = new Date('2026-10-13T09:00:00Z');
const FUTURE = new Date('2026-10-13T11:00:00Z');

const live = { isActive: true, bannedAt: null };
const deactivated = { isActive: false, bannedAt: null };
const banned = { isActive: true, bannedAt: PAST };

describe('guestAccessEnd — l’ordre unique des causes de fin d’accès d’un invité (#10457)', () => {
  it('lien expiré ET participation morte ⇒ « lien expiré », la cause première', () => {
    expect(guestAccessEnd({ linkExpiresAt: PAST, participation: deactivated, now: NOW })).toBe('link-expired');
    expect(guestAccessEnd({ linkExpiresAt: PAST, participation: banned, now: NOW })).toBe('link-expired');
  });

  it('lien ouvert et participation désactivée ou bannie ⇒ « accès retiré »', () => {
    expect(guestAccessEnd({ linkExpiresAt: FUTURE, participation: deactivated, now: NOW })).toBe('revoked');
    expect(guestAccessEnd({ linkExpiresAt: null, participation: banned, now: NOW })).toBe('revoked');
  });

  it('participation introuvable ⇒ « accès retiré » (la relecture d’une ligne effacée)', () => {
    expect(guestAccessEnd({ linkExpiresAt: null, participation: null, now: NOW })).toBe('revoked');
  });

  it('lien expiré et participation vivante ⇒ « lien expiré »', () => {
    expect(guestAccessEnd({ linkExpiresAt: PAST, participation: live, now: NOW })).toBe('link-expired');
  });

  it('lien ouvert, sans échéance ou introuvable, et participation vivante ⇒ accès ouvert', () => {
    expect(guestAccessEnd({ linkExpiresAt: FUTURE, participation: live, now: NOW })).toBeNull();
    expect(guestAccessEnd({ linkExpiresAt: null, participation: live, now: NOW })).toBeNull();
  });

  it('`isActive` doit valoir `true`, pas seulement « non faux »', () => {
    expect(guestAccessEnd({ linkExpiresAt: null, participation: { isActive: null, bannedAt: null }, now: NOW })).toBe('revoked');
  });
});
