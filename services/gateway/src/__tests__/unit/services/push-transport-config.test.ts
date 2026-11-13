/**
 * #17249 — la configuration des transports de push, lue UNE fois : APNs n'est prêt que
 * complet (activé, Key ID, Team ID, clé), et le démarrage dit ce qui manque, sans jamais
 * afficher un secret.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  apnsConfigurationGaps,
  pushConfigurationReport,
  pushTransportConfigFromEnv,
  warnPushConfiguration,
} from '../../../services/push-transport-config';

const COMPLETE = {
  APNS_KEY_ID: 'KEYID12345',
  APNS_TEAM_ID: 'TEAMID1234',
  APNS_KEY_PATH: '/app/secrets/apns_key.p8',
  APNS_BUNDLE_ID: 'me.meeshy.app',
  FIREBASE_ADMIN_CREDENTIALS_PATH: '/app/secrets/firebase-admin-sdk.json',
};
const SECRET_KEY = '-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg\n-----END PRIVATE KEY-----';
const exists = () => true;

describe('#17249 — APNs n’est prêt que complet', () => {
  it('configuration complète : aucun manque', () => {
    expect(apnsConfigurationGaps(pushTransportConfigFromEnv(COMPLETE))).toEqual([]);
  });

  it('la clé en contenu vaut la clé en fichier', () => {
    const { APNS_KEY_PATH: _path, ...env } = COMPLETE;
    expect(apnsConfigurationGaps(pushTransportConfigFromEnv({ ...env, APNS_KEY_CONTENT: SECRET_KEY }))).toEqual([]);
  });

  it('aucune variable APNS_* (le staging du 2026-11-09) : chaque manque nommé', () => {
    expect(apnsConfigurationGaps(pushTransportConfigFromEnv({}))).toEqual(['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY_PATH|APNS_KEY_CONTENT']);
  });

  it('Key ID et Team ID sans clé : incomplet (avant, des clients naissaient sans clé)', () => {
    const { APNS_KEY_PATH: _path, ...env } = COMPLETE;
    expect(apnsConfigurationGaps(pushTransportConfigFromEnv(env))).toEqual(['APNS_KEY_PATH|APNS_KEY_CONTENT']);
  });

  it.each([
    ['ENABLE_APNS_PUSH', 'ENABLE_APNS_PUSH=false'],
    ['ENABLE_PUSH_NOTIFICATIONS', 'ENABLE_PUSH_NOTIFICATIONS=false'],
  ])('%s=false : désactivé, quoi qu’il y ait à côté', (flag, gap) => {
    expect(apnsConfigurationGaps(pushTransportConfigFromEnv({ ...COMPLETE, [flag]: 'false' }))).toEqual([gap]);
  });

  it('défauts inchangés : bundle me.meeshy.app, bundle VoIP me.meeshy.app.voip', () => {
    expect(pushTransportConfigFromEnv({}).apns).toMatchObject({ bundleId: 'me.meeshy.app', voipBundleId: 'me.meeshy.app.voip' });
  });
});

describe('#17249 — le démarrage dit ce qui manque, jamais un secret', () => {
  it('APNs incomplet : un avertissement qui nomme les manques et l’effet sur le talkie', () => {
    const report = pushConfigurationReport(pushTransportConfigFromEnv({ FIREBASE_ADMIN_CREDENTIALS_PATH: COMPLETE.FIREBASE_ADMIN_CREDENTIALS_PATH }), exists);
    const apns = report.find((line) => line.transport === 'apns');

    expect(apns).toMatchObject({ level: 'warn', fields: { missing: ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY_PATH|APNS_KEY_CONTENT'] } });
    expect(apns?.message).toMatch(/PushToTalk/);
    expect(apns?.message).toMatch(/repli/);
  });

  it('une clé en fichier introuvable : nommée comme un manque', () => {
    const report = pushConfigurationReport(pushTransportConfigFromEnv(COMPLETE), (path) => path !== COMPLETE.APNS_KEY_PATH);

    expect(report.find((line) => line.transport === 'apns')).toMatchObject({ level: 'warn', fields: { missing: ['APNS_KEY_PATH (fichier introuvable)'] } });
  });

  it('APNs complet : une ligne d’information, avec bundle et source de la clé, sans Key ID, Team ID ni clé', () => {
    const report = pushConfigurationReport(pushTransportConfigFromEnv({ ...COMPLETE, APNS_KEY_PATH: undefined, APNS_KEY_CONTENT: SECRET_KEY }), exists);
    const apns = report.find((line) => line.transport === 'apns');

    expect(apns).toMatchObject({ level: 'info', fields: { bundleId: 'me.meeshy.app', keySource: 'content' } });
    const printed = JSON.stringify(report);
    expect(printed).not.toContain('BEGIN PRIVATE KEY');
    expect(printed).not.toContain(COMPLETE.APNS_KEY_ID);
    expect(printed).not.toContain(COMPLETE.APNS_TEAM_ID);
  });

  it('bundle non déclaré : le défaut est dit', () => {
    const { APNS_BUNDLE_ID: _bundle, ...env } = COMPLETE;
    const apns = pushConfigurationReport(pushTransportConfigFromEnv(env), exists).find((line) => line.transport === 'apns');

    expect(apns?.fields).toMatchObject({ bundleId: 'me.meeshy.app', bundleFromEnv: false });
  });

  it('FCM sans identifiants : avertissement', () => {
    const { FIREBASE_ADMIN_CREDENTIALS_PATH: _fcm, ...env } = COMPLETE;
    expect(pushConfigurationReport(pushTransportConfigFromEnv(env), exists).find((line) => line.transport === 'fcm')).toMatchObject({
      level: 'warn',
      fields: { missing: ['FIREBASE_ADMIN_CREDENTIALS_PATH'] },
    });
  });

  it('warnPushConfiguration écrit chaque ligne à son niveau', () => {
    const logger = { warn: jest.fn(), info: jest.fn() };
    warnPushConfiguration(logger, {}, exists);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[PUSH_CONFIG]'), expect.objectContaining({ missing: expect.arrayContaining(['APNS_KEY_ID']) }));
  });
});
