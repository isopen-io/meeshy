import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

/**
 * **« RÉPONDRE » SUR LA BANNIÈRE D'UN MESSAGE DANS LA COQUE ANDROID** (#10891)
 * — le web (#8860) et iOS (#8858) l'offrent ; FCM affiche la bannière de la
 * coque sans aucune action. La coque la reprend après l'affichage, comme pour
 * « Écouter » (#10641), et le toucher suit le lien du widget de réponse
 * (`meeshy://c/<id>?compose=1`, #10626) : le fil s'ouvre, le curseur y est.
 * La décision est testée en JVM (`NotificationReplyRulesTest`) ; ce témoin
 * garde le câblage que la JVM ne voit pas.
 */

const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (fichier: string): string => readFileSync(join(JAVA, fichier), 'utf8');

const corpsDe = (source: string, signature: string): string => {
  const debut = source.indexOf(signature);
  if (debut < 0) return '';
  let profondeur = 0;
  for (let i = source.indexOf('{', debut); i < source.length; i += 1) {
    if (source[i] === '{') profondeur += 1;
    if (source[i] === '}') profondeur -= 1;
    if (profondeur === 0) return source.slice(debut, i + 1);
  }
  return '';
};

describe('« Répondre » sur la bannière d’un message (#10891)', () => {
  test('la charge retenue garde le libellé localisé de la passerelle', () => {
    expect(lire('NotificationVoiceBanner.java')).toContain('"replyActionLabel"');
  });

  test('un push qui n’est pas un vocal écoutable reçoit quand même « Répondre »', () => {
    const offre = corpsDe(lire('NotificationVoiceBanner.java'), 'static void offer(');
    expect(offre).toContain('NotificationReplyAction.offer(');
  });

  test('un vocal porte « Écouter » ET « Répondre »', () => {
    const place = corpsDe(lire('NotificationVoiceBanner.java'), 'private static boolean place(');
    expect(place).toContain('NotificationReplyAction.');
  });

  test('l’action ouvre MainActivity par le lien du widget, et ne vole jamais les actions d’une autre bannière', () => {
    const action = lire('NotificationReplyAction.java');
    expect(action).toContain('MainActivity.class');
    expect(action).toContain('PendingIntent.getActivity(');
    expect(action).toContain('recoverBuilder(');
    expect(action).toContain('setOnlyAlertOnce(true)');
    expect(action).toMatch(/\.actions\b/);
  });

  test('le toucher retire la bannière, à froid comme à chaud', () => {
    const intent = corpsDe(lire('MeeshyWidgetsPlugin.java'), 'protected void handleOnNewIntent(');
    expect(intent).toContain('NotificationReplyAction.dismiss(');
    expect(intent.indexOf('NotificationReplyAction.dismiss(')).toBeLessThan(intent.indexOf('composeTarget('));
  });
});
