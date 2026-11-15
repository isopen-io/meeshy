/**
 * LA RELEASE DE LA COQUE ANDROID, CELLE QUI PART AU PLAY STORE (#8669).
 *
 * `build-shells.mjs --target android --release` passe par ici. Tout ce qui
 * rendrait la release inutilisable une fois installée se refuse AVANT vite,
 * `cap sync` et gradle :
 *
 * - aucune clé de signature : `build.gradle` construirait une release NON
 *   signée (repli voulu pour la recette, #8085), que le store rejette ;
 * - aucun `google-services.json` de la coque : le plugin Google Services ne
 *   s'appliquerait pas, et aucun push n'arriverait application fermée (#7302) ;
 * - une autre passerelle que la production : les utilisateurs du store
 *   parleraient à la recette.
 */

export const ANDROID_APPLICATION_ID = 'me.meeshy.app';

/** Miroir de `PRODUCTION_ORIGIN` (`src/lib/api/config.ts`), que node ne peut pas importer sans construire. */
export const ANDROID_RELEASE_API_BASE = 'https://gate.meeshy.me';

const SIGNING_ENV_KEYS = Object.freeze([
  'MEESHY_ANDROID_STORE_FILE',
  'MEESHY_ANDROID_STORE_PASSWORD',
  'MEESHY_ANDROID_KEY_ALIAS',
  'MEESHY_ANDROID_KEY_PASSWORD',
]);

const present = (value) => typeof value === 'string' && value.trim() !== '';

function signingViolations(env, localKeystoreProperties) {
  if (localKeystoreProperties || present(env.MEESHY_ANDROID_KEYSTORE_PROPERTIES)) return [];
  const missing = SIGNING_ENV_KEYS.filter((key) => !present(env[key]));
  if (missing.length === 0) return [];
  if (missing.length === SIGNING_ENV_KEYS.length) {
    return [
      'aucune clé de signature : poser android/keystore.properties, MEESHY_ANDROID_KEYSTORE_PROPERTIES, ou les ' +
        `quatre variables ${SIGNING_ENV_KEYS.join(', ')} — sans elles la release partirait non signée (#8085).`,
    ];
  }
  return [`clé de signature incomplète — manquent : ${missing.join(', ')}.`];
}

function packageNamesOf(parsed) {
  const clients = Array.isArray(parsed?.client) ? parsed.client : [];
  return clients.map((client) => client?.client_info?.android_client_info?.package_name).filter(present);
}

function googleServicesViolations(json) {
  if (json === null) {
    return [
      'android/app/google-services.json est absent — sans lui le plugin Google Services ne s’applique pas et ' +
        'aucune notification n’arrive application fermée (#7302).',
    ];
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return ['android/app/google-services.json n’est pas un JSON lisible.'];
  }
  if (packageNamesOf(parsed).includes(ANDROID_APPLICATION_ID)) return [];
  return [
    `android/app/google-services.json ne déclare aucune application ${ANDROID_APPLICATION_ID} — c’est le fichier ` +
      'd’une autre application Firebase, et FCM n’enregistrerait aucun jeton.',
  ];
}

function apiBaseViolations(apiBase) {
  if (apiBase === ANDROID_RELEASE_API_BASE) return [];
  return [
    `VITE_API_BASE="${apiBase}" — une release du store sert ${ANDROID_RELEASE_API_BASE}, jamais une recette.`,
  ];
}

export function auditAndroidReleaseInputs({ apiBase, env, localKeystoreProperties, googleServicesJson }) {
  return [
    ...apiBaseViolations(apiBase),
    ...signingViolations(env, localKeystoreProperties),
    ...googleServicesViolations(googleServicesJson),
  ];
}

export function androidReleaseGradleArgs(buildNumber) {
  return ['bundleRelease', 'assembleRelease', `-PmeeshyBuildNumber=${buildNumber}`];
}

export const androidReleaseArtifacts = Object.freeze({
  bundle: 'android/app/build/outputs/bundle/release/app-release.aab',
  apk: 'android/app/build/outputs/apk/release/app-release.apk',
  apkMetadata: 'android/app/build/outputs/apk/release/output-metadata.json',
});
