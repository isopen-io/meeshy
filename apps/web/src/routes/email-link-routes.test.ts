import { describe, expect, test } from 'bun:test';

import { compile, match } from '@/lib/router';
import { resolveRouteAccess } from '@/lib/session-guard';

import { ROUTES } from './route-table';

/**
 * LES ADRESSES QUE LES LIENS REÇUS VISENT (#6714, #6715) — chacune est
 * composée par la passerelle et circule déjà dans des e-mails, des messages
 * et des publications. Le routeur rend la PREMIÈRE route qui correspond : le
 * témoin cherche donc la route ÉLUE pour chaque adresse, pas seulement une
 * route qui l'accepte.
 */

const electedRoute = (path: string): string | undefined =>
  Object.entries(ROUTES).find(([, route]) => match(compile(route.pattern), path) !== null)?.[0];

describe('chaque adresse composée par la passerelle a sa route', () => {
  test('/l/:token (`TrackingLinkService.buildTrackingUrl`) et son état clos', () => {
    expect(electedRoute('/l/abc123')).toBe('trackingLink');
    expect(electedRoute('/l/abc123/expired')).toBe('trackingLinkExpired');
    expect(match(compile(ROUTES.trackingLinkExpired.pattern), '/l/abc123/expired')).toEqual({ token: 'abc123' });
  });

  test('/account/deletion (`buildDeletionPageUrl`)', () => {
    expect(electedRoute('/account/deletion')).toBe('accountDeletion');
  });

  test('/settings/verify-email-change (`contact-change.ts`, `contact-changes.ts`)', () => {
    expect(electedRoute('/settings/verify-email-change')).toBe('verifyEmailChange');
  });

  test('/settings/notifications (`broadcast-sender.ts`) n’est pas pris pour /settings', () => {
    expect(electedRoute('/settings/notifications')).toBe('settingsNotifications');
    expect(electedRoute('/settings')).toBe('settings');
  });
});

/**
 * Aucune n'est refusée par la garde de route : un lien reçu doit s'ouvrir
 * quel que soit le statut. Deux des cinq agissent sur le compte CONNECTÉ ;
 * ce sont leurs écrans qui disent, sans dépenser le jeton, qu'il faut se
 * connecter — une redirection de la garde perdrait le jeton en chemin.
 */
describe('la garde laisse passer chaque lien reçu', () => {
  test('quel que soit le statut de session', () => {
    for (const routeKey of ['trackingLink', 'trackingLinkExpired', 'accountDeletion', 'verifyEmailChange', 'settingsNotifications']) {
      for (const sessionStatus of ['anonymous', 'pending2fa', 'authenticated'] as const) {
        expect({ routeKey, sessionStatus, decision: resolveRouteAccess({ sessionStatus, source: 'gateway', routeKey }) }).toEqual({
          routeKey,
          sessionStatus,
          decision: 'allow',
        });
      }
    }
  });
});
