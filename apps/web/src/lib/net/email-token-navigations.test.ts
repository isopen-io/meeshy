import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';

import { EMAIL_TOKEN_NAVIGATIONS } from './email-token-navigations';

/**
 * UN LIEN D'E-MAIL QUI PORTE UN JETON EST TOUJOURS SERVI PAR LE CODE DÉPLOYÉ
 * (#8053).
 *
 * Recette porteur 2026-09-26 : le lien « Vérifier mon adresse » ouvrait
 * l'écran du CODE au lieu de connecter. Les journaux de staging l'ont dit :
 * aucune requête du document `/auth/verify-email` n'a atteint nginx — le
 * service worker répondait par la coquille PRÉCACHÉE, celle de la version
 * d'avant #8034, qui ne lisait pas `?token=`. Le worker neuf, sous
 * `registerType: 'prompt'`, attendait qu'on clique « Mettre à jour ».
 *
 * Un jeton d'e-mail est à usage unique et n'a de sens qu'en ligne : laisser sa
 * navigation au réseau ne retire rien au hors-ligne, et garantit que la page
 * qui le consomme est celle que le serveur sert MAINTENANT.
 */

const sentToNetwork = (address: string): boolean => EMAIL_TOKEN_NAVIGATIONS.some((pattern) => pattern.test(address));

/** Les formes exactes que la passerelle écrit dans ses e-mails (Workbox confronte `pathname + search`). */
const EMAILED_LINKS = [
  /* services/gateway/src/services/auth/email-code.ts — emailCodeLink */
  '/auth/verify-email?token=9f3c0a&email=hello%40sylorion.com',
  /* services/gateway/src/services/MagicLinkService.ts, routes/magic-link.ts */
  '/auth/magic-link?token=abc123&returnUrl=%2Fc%2F1',
  '/auth/magic-link?token=abc123',
  /* services/gateway/src/jobs/notification-digest.ts — buildMagicUrl */
  '/auth/magic-link/validate?token=abc123&returnUrl=%2Fnotifications',
  /* services/gateway/src/services/PasswordResetService.ts */
  '/reset-password?token=abc123',
  /* services/gateway/src/routes/me/delete-account.ts — buildDeletionPageUrl */
  '/account/deletion?token=abc123&action=confirm',
  /* services/gateway/src/routes/users/contact-change(s).ts */
  '/settings/verify-email-change?token=abc123',
  /* un client de messagerie peut réordonner ou préfixer la requête */
  '/auth/verify-email?email=hello%40sylorion.com&token=9f3c0a',
] as const;

describe('EMAIL_TOKEN_NAVIGATIONS — les liens à jeton partent au réseau', () => {
  test('chaque lien qu’un e-mail porte atteint le serveur, jamais la coquille précachée', () => {
    for (const address of EMAILED_LINKS) {
      expect({ address, network: sentToNetwork(address) }).toEqual({ address, network: true });
    }
  });

  test('chaque lien vise bien une route de l’application', () => {
    for (const address of EMAILED_LINKS) {
      const path = address.split('?')[0] ?? address;
      const routed = Object.values(ROUTES).some((route) => route.pattern === path);
      expect({ path, routed }).toEqual({ path, routed: true });
    }
  });

  test('les mêmes écrans SANS jeton restent à la coquille (hors ligne intact)', () => {
    for (const address of [
      '/auth/verify-email?email=hello%40sylorion.com',
      '/auth/verify-email',
      '/auth/magic-link',
      '/reset-password',
      '/account/deletion',
      '/settings/verify-email-change',
      '/login?token=abc',
      '/auth/verify-email-other?token=abc',
      '/auth/verify-email?notatoken=abc',
    ]) {
      expect({ address, network: sentToNetwork(address) }).toEqual({ address, network: false });
    }
  });

  test('aucune autre route de l’application n’est laissée au réseau par ce motif', () => {
    const tokenRoutes = new Set(['/auth/verify-email', '/auth/magic-link', '/auth/magic-link/validate', '/reset-password', '/account/deletion', '/settings/verify-email-change']);
    for (const { pattern } of Object.values(ROUTES)) {
      if (tokenRoutes.has(pattern)) continue;
      const address = `${pattern.replace(/\$[A-Za-z0-9_]+/g, 'x')}?token=abc`;
      expect({ address, network: sentToNetwork(address) }).toEqual({ address, network: false });
    }
  });

  test('le service worker reçoit la liste dans son `navigateFallbackDenylist`', () => {
    const config = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../vite.config.ts'), 'utf8');
    const wired = /navigateFallbackDenylist:\s*\[[^\]]*\.\.\.EMAIL_TOKEN_NAVIGATIONS[^\]]*\]/.test(config);
    expect({ wired }).toEqual({ wired: true });
  });
});
