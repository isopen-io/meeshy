import { describe, expect, test } from 'bun:test';

import { listenNotificationTaps, NOTIFICATION_CLICKED_MESSAGE, notificationTapUrl } from './tap-navigation';

/**
 * LE TAP D'UNE BANNIÈRE A UN EFFET, MÊME QUAND L'APPLICATION EST DÉJÀ OUVERTE
 * (#7305).
 *
 * `sw-push.js` FOCALISE un client existant plutôt que d'ouvrir un second
 * onglet, puis lui remet l'adresse par `postMessage`. Sans quelqu'un pour
 * l'écouter, le tap ramènerait l'onglet au premier plan et l'y laisserait —
 * un contrôle qui ment, pire qu'un contrôle absent (loi 4).
 *
 * **L'adresse est VALIDÉE bien qu'elle vienne de notre propre worker.** Un
 * `message` arrive sur `navigator.serviceWorker` sans que le destinataire ait
 * choisi son expéditeur ; n'accepter qu'un chemin relatif à une seule barre
 * ferme la redirection ouverte par construction, et pas par confiance.
 */

type Trace = { readonly allees: string[] };

const environnement = (trace: Trace) => {
  let ecouteur: ((event: { data: unknown }) => void) | null = null;
  return {
    env: {
      container: {
        addEventListener: (_type: 'message', listener: (event: { data: unknown }) => void) => {
          ecouteur = listener;
        },
      },
      navigate: (url: string) => void trace.allees.push(url),
    },
    envoyer: (data: unknown) => ecouteur?.({ data }),
  };
};

describe('notificationTapUrl — ce qui passe et ce qui ne passe pas', () => {
  test('un message du worker porte son adresse', () => {
    expect(notificationTapUrl({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/abc' })).toBe('/c/abc');
  });

  test('une adresse avec sa requête passe', () => {
    expect(notificationTapUrl({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/discover?onglet=requests' })).toBe(
      '/discover?onglet=requests',
    );
  });

  test('un autre message ne navigue pas', () => {
    expect(notificationTapUrl({ type: 'SKIP_WAITING' })).toBeNull();
  });

  test('une adresse ABSOLUE ne navigue pas — un tap ne quitte pas l’application', () => {
    for (const url of ['https://exemple.test/c/abc', '//exemple.test/c/abc', 'javascript:alert(1)', 'c/abc', '']) {
      expect({ url, cible: notificationTapUrl({ type: NOTIFICATION_CLICKED_MESSAGE, url }) }).toEqual({ url, cible: null });
    }
  });

  test('une charge qui n’est pas un objet ne navigue pas', () => {
    for (const data of [null, undefined, 'NOTIFICATION_CLICKED', 42]) {
      expect(notificationTapUrl(data)).toBeNull();
    }
  });
});

describe('listenNotificationTaps — le tap aboutit', () => {
  test('le message du worker fait naviguer la page', () => {
    const trace: Trace = { allees: [] };
    const { env, envoyer } = environnement(trace);
    listenNotificationTaps(env);
    envoyer({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/abc' });
    expect(trace.allees).toEqual(['/c/abc']);
  });

  test('un message étranger ne fait rien', () => {
    const trace: Trace = { allees: [] };
    const { env, envoyer } = environnement(trace);
    listenNotificationTaps(env);
    envoyer({ type: 'AUTRE' });
    envoyer('bonjour');
    expect(trace.allees).toEqual([]);
  });

  test('sans `navigator.serviceWorker`, il n’y a rien à écouter', () => {
    expect(() => listenNotificationTaps({ container: undefined, navigate: () => undefined })).not.toThrow();
  });
});
