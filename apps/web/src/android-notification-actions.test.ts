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
 * « Ouvrir la carte » et « Rejoindre » s'y ajoutent devant (#10906), comme
 * sur le web. La décision est testée en JVM (`NotificationBannerRulesTest`) ; ce témoin
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
    expect(offre).toContain('NotificationBannerActions.offer(');
  });

  test('un vocal porte « Écouter » ET « Répondre »', () => {
    const place = corpsDe(lire('NotificationVoiceBanner.java'), 'private static boolean place(');
    expect(place).toContain('NotificationBannerActions.');
  });

  test('l’action ouvre MainActivity par le lien du widget, et ne vole jamais les actions d’une autre bannière', () => {
    const action = lire('NotificationBannerActions.java');
    expect(action).toContain('NotificationActionActivity.intentFor(');
    expect(lire('NotificationActionActivity.java')).toContain('MainActivity.class');
    expect(action).toContain('PendingIntent.getActivity(');
    expect(action).toContain('recoverBuilder(');
    expect(action).toContain('setOnlyAlertOnce(true)');
    expect(action).toMatch(/\.actions\b/);
  });

  test('toucher une action note « ouverte » et retire la bannière, carte comprise, comme `notificationclick` (#11052)', () => {
    const relais = corpsDe(lire('NotificationActionActivity.java'), 'private void relay(');
    expect(relais).toContain('NotificationFunnelStore.noteOpened(');
    expect(relais).toContain('manager.cancel(tag, 0)');
    expect(relais.indexOf('manager.cancel(tag, 0)')).toBeLessThan(relais.indexOf('startActivity('));
    expect(lire('../../../../AndroidManifest.xml')).toContain('android:name=".NotificationActionActivity"');
  });

  test('le toucher retire la bannière, à froid comme à chaud', () => {
    const intent = corpsDe(lire('MeeshyWidgetsPlugin.java'), 'protected void handleOnNewIntent(');
    expect(intent).toContain('NotificationBannerActions.dismiss(');
    expect(intent.indexOf('NotificationBannerActions.dismiss(')).toBeLessThan(intent.indexOf('composeTarget('));
  });

  test('« Ouvrir la carte » part à l’app de cartes, « Rejoindre » reste dans l’app (#10906)', () => {
    const ordre = corpsDe(lire('NotificationBannerRules.java'), 'static List<Action> actionsOf(');
    expect(ordre.indexOf('contentOf(')).toBeGreaterThan(-1);
    expect(ordre.indexOf('contentOf(')).toBeLessThan(ordre.indexOf('replyOf('));
    const actions = lire('NotificationBannerActions.java');
    expect(actions).toContain('NotificationBannerRules.actionsOf(');
    expect(actions).toContain('.inApp');
  });

  test('la charge retenue garde ce que l’action de contenu lit', () => {
    const banniere = lire('NotificationVoiceBanner.java');
    for (const cle of ['"contentActionLabel"', '"locationLat"', '"locationLon"', '"locationName"', '"inviteUrl"']) expect(banniere).toContain(cle);
  });
});

describe('« Rappeler » sur la bannière d’un appel manqué (#10908)', () => {
  const MAIN = join(dirname(fileURLToPath(import.meta.url)), 'main.tsx');

  test('la charge retenue garde ce que « Rappeler » lit', () => {
    const banniere = lire('NotificationVoiceBanner.java');
    for (const cle of ['"callBackLabel"', '"callType"', '"conversationType"']) expect(banniere).toContain(cle);
  });

  test('le toucher signale l’appel à composer, retenu pour un lancement à froid, après avoir retiré la bannière', () => {
    const intent = corpsDe(lire('MeeshyWidgetsPlugin.java'), 'protected void handleOnNewIntent(');
    expect(intent).toContain('NotificationBannerRules.callBackRequest(');
    expect(intent).toMatch(/notifyListeners\("callBackRequested", [a-zA-Z]+, true\)/);
    expect(intent.indexOf('NotificationBannerActions.dismiss(')).toBeLessThan(intent.indexOf('callBackRequest('));
  });

  test('la page de la coque compose l’appel signalé', () => {
    const main = readFileSync(MAIN, 'utf8');
    const appel = main.indexOf('listenCallBackIntentsInShell');
    expect(appel).toBeGreaterThan(-1);
    expect(main.slice(main.lastIndexOf('if (', appel), appel)).toContain('__SHELL__');
  });
});
