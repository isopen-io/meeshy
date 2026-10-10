import { describe, expect, test } from 'bun:test';

import {
  ANDROID_APPLICATION_ID,
  ANDROID_RELEASE_API_BASE,
  androidReleaseArtifacts,
  androidReleaseGradleArgs,
  auditAndroidReleaseInputs,
} from './android-release.mjs';

/**
 * **LA COQUE ANDROID SE CONSTRUIT SIGNÉE POUR LE PLAY STORE** (#8669).
 *
 * Une release qui part sans clé, sans Firebase ou contre la mauvaise
 * passerelle ne se rattrape pas une fois installée chez les utilisateurs :
 * chaque refus se prononce AVANT vite, `cap sync` et gradle.
 */

const GOOGLE_SERVICES = JSON.stringify({
  project_info: { project_id: 'meeshy' },
  client: [{ client_info: { android_client_info: { package_name: 'me.meeshy.app' } } }],
});

const SIGNING_ENV = {
  MEESHY_ANDROID_STORE_FILE: '/tmp/meeshy-upload.p12',
  MEESHY_ANDROID_STORE_PASSWORD: 's',
  MEESHY_ANDROID_KEY_ALIAS: 'upload',
  MEESHY_ANDROID_KEY_PASSWORD: 'k',
};

const inputs = (overrides: Partial<Parameters<typeof auditAndroidReleaseInputs>[0]> = {}) => ({
  apiBase: ANDROID_RELEASE_API_BASE,
  env: SIGNING_ENV,
  localKeystoreProperties: false,
  googleServicesJson: GOOGLE_SERVICES,
  ...overrides,
});

describe('auditAndroidReleaseInputs — ce qui doit exister avant de construire une release', () => {
  test('clé par variables, Firebase de la coque, passerelle de production : aucune violation', () => {
    expect(auditAndroidReleaseInputs(inputs())).toEqual([]);
  });

  test('un keystore.properties local suffit à signer', () => {
    expect(auditAndroidReleaseInputs(inputs({ env: {}, localKeystoreProperties: true }))).toEqual([]);
  });

  test('un fichier de propriétés désigné par MEESHY_ANDROID_KEYSTORE_PROPERTIES suffit à signer', () => {
    expect(
      auditAndroidReleaseInputs(inputs({ env: { MEESHY_ANDROID_KEYSTORE_PROPERTIES: '/tmp/k.properties' } })),
    ).toEqual([]);
  });

  test('sans aucune source de clé, la release partirait non signée : refusée', () => {
    const violations = auditAndroidReleaseInputs(inputs({ env: {} }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('signature');
  });

  test('une clé à moitié fournie nomme chaque variable manquante', () => {
    const violations = auditAndroidReleaseInputs(
      inputs({ env: { MEESHY_ANDROID_STORE_FILE: '/tmp/k.p12', MEESHY_ANDROID_KEY_ALIAS: 'upload' } }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('MEESHY_ANDROID_STORE_PASSWORD');
    expect(violations[0]).toContain('MEESHY_ANDROID_KEY_PASSWORD');
  });

  test('sans google-services.json, aucune notification n’arriverait application fermée : refusée', () => {
    const violations = auditAndroidReleaseInputs(inputs({ googleServicesJson: null }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('google-services.json');
  });

  test('un google-services.json illisible est refusé', () => {
    expect(auditAndroidReleaseInputs(inputs({ googleServicesJson: '{ pas du json' }))).toHaveLength(1);
  });

  test('un google-services.json d’une AUTRE application est refusé : FCM n’enregistrerait aucun jeton', () => {
    const other = GOOGLE_SERVICES.replace(ANDROID_APPLICATION_ID, 'com.example.other');
    const violations = auditAndroidReleaseInputs(inputs({ googleServicesJson: other }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(ANDROID_APPLICATION_ID);
  });

  test('une release contre staging est refusée : les utilisateurs du store parleraient à la recette', () => {
    const violations = auditAndroidReleaseInputs(inputs({ apiBase: 'https://gate.staging.meeshy.me' }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(ANDROID_RELEASE_API_BASE);
  });

  test('les refus s’additionnent : tout ce qui manque se lit en une fois', () => {
    expect(auditAndroidReleaseInputs(inputs({ env: {}, googleServicesJson: null, apiBase: 'http://x' }))).toHaveLength(3);
  });
});

describe('la release produit le bundle du store ET un APK installable, signés, au même numéro', () => {
  test('gradle construit bundleRelease et assembleRelease avec le numéro de build', () => {
    expect(androidReleaseGradleArgs(31)).toEqual(['bundleRelease', 'assembleRelease', '-PmeeshyBuildNumber=31']);
  });

  test('les artefacts sont ceux qu’AGP écrit pour la variante release', () => {
    expect(androidReleaseArtifacts).toEqual({
      bundle: 'android/app/build/outputs/bundle/release/app-release.aab',
      apk: 'android/app/build/outputs/apk/release/app-release.apk',
      apkMetadata: 'android/app/build/outputs/apk/release/output-metadata.json',
    });
  });

  test('la passerelle de production est celle que l’application sert par défaut', () => {
    expect(ANDROID_RELEASE_API_BASE).toBe('https://gate.meeshy.me');
    expect(ANDROID_APPLICATION_ID).toBe('me.meeshy.app');
  });
});
