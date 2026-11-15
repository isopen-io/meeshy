import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * APP FERMÉE, UN PUSH MET À JOUR LE WIDGET « NON LUS » DE LA COQUE (#11080).
 *
 * Chaque push de message porte `data.unreadCount`, les conversations non lues
 * hors muettes (D-L1). Le web le pose sur l'icône à chaque push
 * (`sw-push.js` § `poserBadge`), la NSE iOS le recopie dans l'App Group pour
 * ses widgets (`updateSharedUnreadCount`). La coque, elle, ne le lisait pas :
 * le widget gardait le total de la dernière publication de la page.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');

function lire(fichier: string): string {
  return readFileSync(join(JAVA, fichier), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
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

describe('la coque recopie le total non lu du push dans ses widgets (#11080)', () => {
  test('le service de messagerie lit unreadCount de CHAQUE push, bannière retenue ou non', () => {
    const intention = corpsDe(lire('MeeshyMessagingService.java'), /public void handleIntent\(/);
    expect(intention).toContain('WidgetSnapshotRules.unreadOf(data)');
    expect(intention).toContain('WidgetStore.notePushedUnread(');
  });

  test('le total poussé redessine les widgets, et une publication de la page le remplace', () => {
    const magasin = lire('WidgetStore.java');
    const note = corpsDe(magasin, /static synchronized void notePushedUnread\(/);
    expect(note).toContain('WidgetRefresher.refreshAll(');
    expect(corpsDe(magasin, /static void publish\(/)).toContain('remove(KEY_PUSHED_UNREAD)');
    const chargement = corpsDe(magasin, /static WidgetSnapshotRules\.Snapshot load\(/);
    expect(chargement).toContain('WidgetSnapshotRules.withPushedUnread(');
    expect(chargement.indexOf('withPushedUnread(')).toBeLessThan(chargement.indexOf('withReadOverlay('));
  });
});
