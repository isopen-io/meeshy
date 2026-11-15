import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * UNE NOTIFICATION RETIRÉE PAR LE SERVEUR QUITTE AUSSI LE TIROIR DE LA COQUE (#8624).
 *
 * Le gateway pousse `notification_revoked` (data-only) aux plateformes `ios` et
 * `android` ; la coque s'enregistre `android`. Sans branche native, la charge
 * partait au plugin de notifications, qui ne dessine rien et n'avertit que le
 * JS — absent quand l'app est tuée : la bannière d'un message supprimé
 * restait. Le service de messagerie annule donc lui-même les bannières que
 * FCM a posées (`notify(tag, 0)`), avant tout routage.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app', 'MeeshyMessagingService.java');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function corpsDe(code: string, signature: RegExp): string {
  const debut = code.search(signature);
  if (debut < 0) return '';
  const ouverture = code.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouverture; i < code.length; i += 1) {
    if (code[i] === '{') profondeur += 1;
    if (code[i] === '}') profondeur -= 1;
    if (profondeur === 0) return code.slice(ouverture, i + 1);
  }
  return '';
}

describe('la coque Android retire les bannières révoquées (#8624)', () => {
  const recu = corpsDe(sansCommentaires(readFileSync(SERVICE, 'utf8')), /public void onMessageReceived\(/);

  test('la révocation est lue avant le routage des appels et la remise au plugin', () => {
    const revocation = recu.indexOf('NotificationRevocation.tagsToCancel(');
    expect(revocation).toBeGreaterThan(-1);
    expect(recu.indexOf('CallPush.route(')).toBeGreaterThan(revocation);
    expect(recu.indexOf('forward(')).toBeGreaterThan(revocation);
  });

  test('chaque bannière visée est annulée sous le tag et l’id 0 que FCM lui a donnés', () => {
    expect(recu).toMatch(/\.cancel\(\s*\w+\s*,\s*0\s*\)/);
  });

  test('une révocation traitée ne part pas au plugin', () => {
    const revocation = recu.indexOf('NotificationRevocation.tagsToCancel(');
    const suite = recu.slice(revocation, recu.indexOf('CallPush.route('));
    expect(suite).toMatch(/return;/);
  });
});
