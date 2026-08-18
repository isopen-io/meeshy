/**
 * On ne réessaie pas un refus que le client a causé.
 *
 * `withRetry` du service de notifications rejouait sur N'IMPORTE quelle
 * erreur. Un `GET /notifications` répondant 401 partait donc quatre fois
 * (`MAX_RETRIES: 3` + l'appel initial), avec un backoff exponentiel — observé
 * en production le 2026-08-18, quatre 401 identiques dans la console, et la
 * trace de la récursion (`a → await in a → await in a`).
 *
 * Rejouer un 401 ne peut pas aboutir : ce n'est pas le réseau qui a échoué,
 * c'est le jeton qui est refusé. Le rejeu coûte trois requêtes inutiles au
 * serveur, retarde de ~7 s la remontée de l'erreur (1 s + 2 s + 4 s), et
 * pendant ce temps l'interface ne peut ni rafraîchir la session ni déconnecter
 * — elle attend une réponse qui sera la même.
 *
 * La règle : rejouer ce qui PEUT changer d'avis (coupure réseau, 5xx, 429), pas
 * ce qui a été refusé sur le fond (4xx). Le 429 est la seule exception, et elle
 * est logique : le serveur dit explicitement « plus tard ».
 */

import { shouldRetryNotificationFailure } from '@/services/notification.service';

class FakeApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiServiceError';
  }
}

describe('ce qui ne doit JAMAIS être rejoué', () => {
  it('401 — le jeton est refusé, le rejouer donnera le même refus', () => {
    expect(shouldRetryNotificationFailure(new FakeApiError('Unauthorized', 401))).toBe(false);
  });

  it('403 — un droit manquant ne s’acquiert pas en réessayant', () => {
    expect(shouldRetryNotificationFailure(new FakeApiError('Forbidden', 403))).toBe(false);
  });

  it('404 et 400 — la requête elle-même est en cause', () => {
    expect(shouldRetryNotificationFailure(new FakeApiError('Not found', 404))).toBe(false);
    expect(shouldRetryNotificationFailure(new FakeApiError('Bad request', 400))).toBe(false);
  });
});

describe('ce qui MÉRITE un rejeu', () => {
  it('500 et 503 — le serveur peut se rétablir', () => {
    expect(shouldRetryNotificationFailure(new FakeApiError('Server error', 500))).toBe(true);
    expect(shouldRetryNotificationFailure(new FakeApiError('Unavailable', 503))).toBe(true);
  });

  /**
   * Seule exception 4xx, et elle se justifie par le sens : le serveur ne
   * refuse pas la requête sur le fond, il demande d'attendre.
   */
  it('429 — le serveur dit explicitement « plus tard »', () => {
    expect(shouldRetryNotificationFailure(new FakeApiError('Too many requests', 429))).toBe(true);
  });

  /**
   * Une coupure réseau ne porte aucun statut. C'est le cas pour lequel le
   * rejeu a été écrit ; le supprimer en fermant les 4xx serait jeter le bébé.
   */
  it('erreur sans statut — coupure réseau, exactement ce que le rejeu sert', () => {
    expect(shouldRetryNotificationFailure(new Error('Network request failed'))).toBe(true);
    expect(shouldRetryNotificationFailure(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('valeur jetée qui n’est pas une Error', () => {
    expect(shouldRetryNotificationFailure('boom')).toBe(true);
    expect(shouldRetryNotificationFailure(null)).toBe(true);
  });
});
