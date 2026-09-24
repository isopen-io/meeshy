#!/usr/bin/env node
/**
 * UNE COMMANDE UNIQUE CONSTRUIT LES DEUX COQUES CONTRE UNE PASSERELLE RÉELLE
 * (#5815, compagnon gateway #5651).
 *
 * `apps/web-v2` sait déjà résoudre une base d'API absolue en coque
 * (`src/lib/api/config.ts::resolveBase`, fail-closed sur la production) et
 * câbler `VITE_DATA_SOURCE=gateway` (#5650, D-26) : rien ne manquait côté
 * application. Ce qui manquait était une commande de RECETTE qui ne puisse
 * pas rejouer, en silence, l'un des deux défauts déjà mesurés le 2026-09-09 :
 *
 *   M1 — une fuite de recette : `bunx cap sync` lancé APRÈS une recette au
 *        chemin de lien profond (`MEESHY_SHELL_START_PATH`, #5812) synchronise
 *        `server.appStartPath` dans la coque — mesuré sur
 *        `android/app/src/main/assets/capacitor.config.json`, qui portait
 *        encore `/c/c-deploiement` (reste de #5812). Une coque construite
 *        ainsi démarre TOUJOURS sur cet identifiant de FIXTURE, et en source
 *        `gateway` c'est un `ThreadRefused` (D-26 F8) au premier écran.
 *   M2 — la comparaison de soi à soi (leçon 554) : une capture « iOS » peut
 *        montrer web-v2 sur SES fixtures. Les noms des fixtures
 *        (`scripts/lib/fixture-markers.mjs`) ne doivent apparaître dans
 *        AUCUN fichier du dist embarqué construit en `gateway` — mesuré à la
 *        main jusqu'ici (D-26 F9), sans gate.
 *
 * Ce script REFUSE avant de construire (§ `resolveShellBuildEnv`), AUDITE
 * après chaque étape coûteuse (§ `auditShellBundle`, `auditSyncedShellConfig`)
 * et REFUSE le simulateur de RÉFÉRENCE (leçon 554 écrite dans le code, pas
 * dans un prompt — jamais `3E761BC1-845D-49D2-8E4D-E0606E04D3E2`, qui porte
 * l'app native iOS et ne doit jamais recevoir la coque).
 *
 * Usage :
 *   MEESHY_TARGET=capacitor VITE_API_BASE=https://gate.staging.meeshy.me \
 *     VITE_DATA_SOURCE=gateway node scripts/build-shells.mjs \
 *     --target android|ios|both [--no-native]
 *
 * Les trois fonctions ci-dessous sont PURES et exportées pour un témoin sans
 * build (`build-shells.test.ts`) — même discipline que `check-shell-dist.mjs`
 * (`auditShellDist`) : le pilote ne s'exécute que lorsque ce fichier est le
 * POINT D'ENTRÉE.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { allFiles } from './lib/files.mjs';
import { FIXTURE_MARKERS } from './lib/fixture-markers.mjs';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Le simulateur de RÉFÉRENCE — l'app NATIVE iOS y vit (D-1). La coque n'y
 * entre JAMAIS : voir `targets/README.md` § « DEUX SIMULATEURS, DEUX APPS,
 * UN SEUL IDENTIFIANT » (leçon 554). */
export const REFERENCE_IOS_SIMULATOR_UDID = '3E761BC1-845D-49D2-8E4D-E0606E04D3E2';

/** Le simulateur DÉDIÉ à la coque du chantier — le seul destinataire d'un
 * build issu de ce script. */
export const SHELL_IOS_SIMULATOR_UDID = '54438823-4ADC-4536-88D2-FC441395FA04';

const VALID_TARGETS = Object.freeze(['android', 'ios', 'both']);

/**
 * La base d'API — même normalisation que `src/lib/api/config.ts::normalizeOrigin`
 * (barre finale et `/api/v1` surnuméraire retirés), réécrite ICI plutôt
 * qu'importée : `config.ts` évalue `import.meta.env`/`__SHELL__` au niveau
 * module (doc-comment de `apiConfig`), ce qu'un script node ne peut pas
 * fournir sans construire.
 */
function normalizeApiBase(raw) {
  return raw.trim().replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
}

/**
 * Refuse AVANT tout coût — construction, `cap sync`, gradle/xcodebuild.
 *
 * `env` est l'environnement du processus, éventuellement enrichi d'une clé
 * `target` par l'appelant (le pilote y fusionne l'option `--target` de la
 * ligne de commande AVANT d'appeler cette fonction — le CLI n'est jamais
 * testé ici, seule la RÈGLE l'est).
 */
export function resolveShellBuildEnv(env) {
  const apiBaseRaw = env.VITE_API_BASE;
  if (typeof apiBaseRaw !== 'string' || !/^https?:\/\//i.test(apiBaseRaw.trim())) {
    throw new Error(
      `VITE_API_BASE doit être une origine ABSOLUE (https://…) pour construire une coque — reçu ` +
        `${JSON.stringify(apiBaseRaw ?? null)}. Une base RELATIVE ne mène nulle part depuis une ` +
        'WebView (capacitor://localhost/api/v1, https://localhost/api/v1 ne résolvent nulle part) ' +
        'et REFUSER est le comportement voulu : `config.ts::resolveBase` retomberait, lui, sur la ' +
        "production en silence (fail-closed d'exécution) — une recette « staging » qui frappe la " +
        'production sans le dire est exactement le défaut que cette commande existe pour ne jamais ' +
        'produire.',
    );
  }

  const dataSource = env.VITE_DATA_SOURCE;
  if (dataSource !== 'gateway') {
    throw new Error(
      `VITE_DATA_SOURCE doit valoir "gateway" pour construire une coque de RECETTE — reçu ` +
        `${JSON.stringify(dataSource ?? null)}. Une coque construite sur "fixtures" (ou la variable ` +
        'absente) monterait Amina Diallo, Kwame Mensah et Fatou Bâ sur l’écran de recette au lieu du ' +
        'compte semé cible-web-trois (leçon 554) — la garde de `vite.config.ts` refuserait de toute ' +
        'façon une valeur ni "fixtures" ni "gateway" ni absente, mais SEULEMENT au moment de `vite ' +
        'build`, après que ce script aurait déjà pu lancer `bunx cap sync`.',
    );
  }

  if (env.MEESHY_SHELL_START_PATH !== undefined) {
    throw new Error(
      `MEESHY_SHELL_START_PATH="${env.MEESHY_SHELL_START_PATH}" est posé — une coque LIVRÉE ne porte ` +
        'jamais un chemin de RECETTE (`capacitor.config.ts:26-112` : « chemin de RECETTE : ne jamais ' +
        'synchroniser une coque livrée avec ce paramètre posé »). Le retirer avant de construire.',
    );
  }

  const targetRaw = env.target ?? 'both';
  if (!VALID_TARGETS.includes(targetRaw)) {
    throw new Error(
      `--target="${targetRaw}" inconnu — les cibles admises sont : ${VALID_TARGETS.join(', ')}.`,
    );
  }

  return Object.freeze({
    apiBase: normalizeApiBase(apiBaseRaw),
    dataSource,
    target: targetRaw,
  });
}

/**
 * LE SIMULATEUR QUI REÇOIT LA COQUE — jamais celui de RÉFÉRENCE (leçon 554).
 *
 * PURE et exportée parce qu'une garde qui ne vit que dans le pilote ne
 * s'exécute qu'au moment où elle coûte le plus cher : ce que le témoin
 * `build-shells.test.ts` doit pouvoir faire échouer, c'est la RÈGLE — deux
 * constantes qui diffèrent ne prouvent rien de la garde qui les compare.
 */
export function resolveShellSimulatorUdid(env) {
  const udid = env.MEESHY_SHELL_IOS_UDID ?? SHELL_IOS_SIMULATOR_UDID;
  if (udid === REFERENCE_IOS_SIMULATOR_UDID) {
    throw new Error(
      `MEESHY_SHELL_IOS_UDID="${udid}" est le simulateur de RÉFÉRENCE (« Meeshy Ref-Native » — ` +
        "l'app NATIVE iOS y vit, D-1) : la coque ne s'y installe JAMAIS (leçon 554). Utiliser " +
        `"${SHELL_IOS_SIMULATOR_UDID}" (« Meeshy Poc-Web-V31 »).`,
    );
  }
  return udid;
}

/**
 * Audite le `capacitor.config.json` SYNCHRONISÉ (`android/app/src/main/assets/…`
 * ou `ios/App/App/…`) — ferme M1 : une coque synchronisée ne doit JAMAIS
 * porter `server.appStartPath` (un chemin de RECETTE), et doit rester sur le
 * contrat déclaré par `capacitor.config.ts` (`appId`, `server.androidScheme`
 * — dont dépend l’origine `https://localhost` gardée côté passerelle, #5815).
 */
export function auditSyncedShellConfig(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return [`capacitor.config.json synchronisé illisible : ${err instanceof Error ? err.message : String(err)}`];
  }

  const violations = [];
  const server = parsed && typeof parsed === 'object' ? (parsed.server ?? {}) : {};

  if (server.appStartPath !== undefined) {
    violations.push(
      `server.appStartPath="${server.appStartPath}" est présent dans la coque SYNCHRONISÉE — un ` +
        'paramètre de RECETTE (`capacitor.config.ts:26-112`), jamais dans une coque livrée (fuite ' +
        'mesurée le 2026-09-09, M1).',
    );
  }
  if (parsed?.appId !== 'me.meeshy.app') {
    violations.push(
      `appId="${parsed?.appId}" — attendu "me.meeshy.app" (le contrat de \`capacitor.config.ts\`).`,
    );
  }
  if (server.androidScheme !== 'https') {
    violations.push(
      `server.androidScheme="${server.androidScheme}" — attendu "https" : l’origine servie par la ` +
        'coque Android (`https://localhost`, gardée côté passerelle, #5815) en dépend.',
    );
  }

  return violations;
}

/**
 * Audite le BUNDLE construit (fichiers `{path, text}`, jamais moins que ce
 * que `vite build` écrit réellement sous `dist/`) — ferme M2 : aucun
 * marqueur de fixture ne doit y voyager, et la base d’API demandée doit être
 * effectivement celle qui a été inlinée (sinon la construction n’a pas lu
 * `VITE_API_BASE`, un défaut de configuration silencieux et pire).
 */
export function auditShellBundle(files, { apiBase }) {
  const violations = [];

  for (const marker of FIXTURE_MARKERS) {
    const hit = files.find((file) => file.text.includes(marker));
    if (hit !== undefined) {
      violations.push(
        `le marqueur de fixture "${marker}" est présent dans ${hit.path} — une coque de recette ` +
          'construite sur VITE_DATA_SOURCE=gateway ne doit porter AUCUNE fixture (leçon 554).',
      );
    }
  }

  const inlinesApiBase = files.some(
    (file) => file.path.endsWith('.js') && file.text.includes(apiBase),
  );
  if (!inlinesApiBase) {
    violations.push(
      `aucun fichier .js du bundle n’inclut la base d’API demandée ("${apiBase}") — la construction ` +
        'n’a pas lu `VITE_API_BASE` (`src/lib/api/config.ts::resolveBase`).',
    );
  }

  return violations;
}

/**
 * Résout la version du produit depuis `package.json` (#6196) — jamais une
 * littérale recopiée à la main dans une coque. Prend le TEXTE, pas un chemin :
 * même discipline que `auditSyncedShellConfig`, testable sans toucher au
 * disque.
 */
export function resolveShellVersion(packageJsonRaw) {
  let parsed;
  try {
    parsed = JSON.parse(packageJsonRaw);
  } catch (err) {
    throw new Error(`package.json illisible : ${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    throw new Error(
      `package.json ne porte aucune "version" exploitable — reçu ${JSON.stringify(parsed.version ?? null)}.`,
    );
  }
  return parsed.version;
}

const ANDROID_VERSION_NAME_RE = /versionName\s+"([^"]*)"/;

/**
 * Retire les COMMENTAIRES avant tout audit de forme de `build.gradle`. Sans
 * cela, une garde se laisse satisfaire par une PHRASE : `versionCode 1` sous
 * un commentaire qui parle de `meeshyBuildNumber` passait l'audit, parce que
 * `exec` rend la PREMIÈRE occurrence et qu'un commentaire en est une. Une
 * garde qu'un commentaire contente ne garde rien.
 *
 * Le `[^:]` épargne `https://…` (le `//` d'une URL n'ouvre pas un commentaire).
 */
export function stripGradleComments(gradleText) {
  return gradleText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

/**
 * Audite `android/app/build.gradle` — ferme #6196 côté Android : `versionName`
 * doit égaler la version de `package.json`, jamais une littérale recopiée à
 * la main (le gabarit Capacitor pose "1.0" une fois pour toutes à `cap add`).
 */
export function auditAndroidVersionName(gradleText, version) {
  const match = ANDROID_VERSION_NAME_RE.exec(stripGradleComments(gradleText));
  if (match === null) {
    return ['aucun "versionName" trouvé dans build.gradle — le fichier a-t-il changé de forme ?'];
  }
  if (match[1] !== version) {
    return [
      `versionName="${match[1]}" ne correspond pas à la version de package.json ("${version}") — la ` +
        'coque Android doit DÉRIVER son numéro, jamais le recopier à la main (#6196).',
    ];
  }
  return [];
}

/** Réécrit `versionName` avec la version DÉRIVÉE de `package.json` (#6196). */
export function deriveAndroidVersionName(gradleText, version) {
  if (ANDROID_VERSION_NAME_RE.exec(gradleText) === null) {
    throw new Error('aucun "versionName" trouvé dans build.gradle — impossible de dériver la version.');
  }
  return gradleText.replace(ANDROID_VERSION_NAME_RE, `versionName "${version}"`);
}

const IOS_MARKETING_VERSION_RE = /MARKETING_VERSION = [^;]+;/g;

/**
 * Audite `project.pbxproj` — ferme #6196 côté iOS : `MARKETING_VERSION` doit
 * égaler la version de `package.json` sur CHAQUE configuration (Debug ET
 * Release), jamais une littérale recopiée à la main.
 */
export function auditIosMarketingVersion(pbxprojText, version) {
  const matches = [...pbxprojText.matchAll(IOS_MARKETING_VERSION_RE)];
  if (matches.length === 0) {
    return ['aucun "MARKETING_VERSION" trouvé dans project.pbxproj — le fichier a-t-il changé de forme ?'];
  }
  const expected = `MARKETING_VERSION = ${version};`;
  return matches
    .filter((m) => m[0] !== expected)
    .map(
      (m) =>
        `"${m[0]}" ne correspond pas à la version de package.json ("${version}") — la coque iOS doit ` +
        'DÉRIVER son numéro, jamais le recopier à la main (#6196).',
    );
}

/** Réécrit CHAQUE `MARKETING_VERSION` avec la version DÉRIVÉE de `package.json` (#6196). */
export function deriveIosMarketingVersion(pbxprojText, version) {
  const matches = [...pbxprojText.matchAll(IOS_MARKETING_VERSION_RE)];
  if (matches.length === 0) {
    throw new Error('aucun "MARKETING_VERSION" trouvé dans project.pbxproj — impossible de dériver la version.');
  }
  return pbxprojText.replace(IOS_MARKETING_VERSION_RE, `MARKETING_VERSION = ${version};`);
}

/**
 * Audite la FORME d'`Info.plist` — miroir de `BundleVersionVariableGuardTests.swift`
 * (#6186) : les deux clés de version doivent RÉSOUDRE une variable de build,
 * jamais porter un nombre en dur. Une garde sur la valeur serait vraie le
 * jour où on l'aligne à la main, puis fausse à la construction suivante ;
 * seule la variable `$(…)` énonce l'invariant.
 */
const IOS_PLIST_VERSION_KEYS = Object.freeze([
  { key: 'CFBundleShortVersionString', expected: '$(MARKETING_VERSION)' },
  { key: 'CFBundleVersion', expected: '$(CURRENT_PROJECT_VERSION)' },
]);

export function auditIosInfoPlistVersionForm(plistXml) {
  return IOS_PLIST_VERSION_KEYS.flatMap(({ key, expected }) => {
    const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
    const match = re.exec(plistXml);
    if (match === null) {
      return [`Info.plist ne porte aucune clé "${key}" — attendu "${expected}".`];
    }
    if (match[1] !== expected) {
      return [
        `Info.plist porte "${key}" = "${match[1]}" — attendu "${expected}" : la version se RÉSOUT, elle ` +
          'ne se recopie jamais en dur (miroir de BundleVersionVariableGuardTests.swift, #6186).',
      ];
    }
    return [];
  });
}

/**
 * Résout le numéro de BUILD des coques (D-45) — distinct de la VERSION
 * (`resolveShellVersion`, produit) : un fait de CONSTRUCTION, jamais commis.
 * UNE source : `MEESHY_SHELL_BUILD_NUMBER` si posé, sinon le compte de
 * commits de `HEAD`. Fail-closed sur un dépôt superficiel sans compteur
 * explicite — un clone `fetch-depth: 1` ne doit jamais fabriquer un build
 * "1" en silence — et sur le plafond `versionCode` d'Android (2 100 000 000).
 */
const ANDROID_VERSION_CODE_MAX = 2_100_000_000;

export function resolveShellBuildNumber({ env, commitCount, shallow }) {
  const override = env.MEESHY_SHELL_BUILD_NUMBER;
  if (override !== undefined) {
    if (!/^[1-9]\d*$/.test(override)) {
      throw new Error(
        `MEESHY_SHELL_BUILD_NUMBER="${override}" n'est pas un entier positif — un numéro de build est un ` +
          'compteur, jamais zéro, jamais négatif, jamais décimal.',
      );
    }
    const value = Number(override);
    if (value > ANDROID_VERSION_CODE_MAX) {
      throw new Error(
        `MEESHY_SHELL_BUILD_NUMBER="${override}" dépasse le plafond ${ANDROID_VERSION_CODE_MAX} qu'Android ` +
          'impose à versionCode.',
      );
    }
    return value;
  }

  if (shallow) {
    throw new Error(
      'le dépôt est SUPERFICIEL (git rev-parse --is-shallow-repository) et aucun MEESHY_SHELL_BUILD_NUMBER ' +
        "n'est posé — le compte de commits d'un clone superficiel n'est pas un numéro de build, c'est une " +
        'absence déguisée en 1. Poser MEESHY_SHELL_BUILD_NUMBER (CI) ou `git fetch --unshallow` (poste local).',
    );
  }

  if (!Number.isInteger(commitCount) || commitCount < 1) {
    throw new Error(`commitCount="${commitCount}" doit être un entier ≥ 1 (git rev-list --count HEAD).`);
  }
  if (commitCount > ANDROID_VERSION_CODE_MAX) {
    throw new Error(
      `commitCount=${commitCount} dépasse le plafond ${ANDROID_VERSION_CODE_MAX} qu'Android impose à ` +
        'versionCode — poser MEESHY_SHELL_BUILD_NUMBER.',
    );
  }
  return commitCount;
}

/**
 * Audite la FORME de `versionCode` dans `build.gradle`. DEUX exigences, et la
 * seconde a été payée par une construction gradle en échec :
 *
 *   1. il doit LIRE `meeshyBuildNumber`, jamais porter une littérale — le `1`
 *      du gabarit Capacitor signifie « construit hors du site unique », pas
 *      « build numéro 1 » ;
 *   2. il doit être une AFFECTATION (`versionCode = …`). Groovy parse
 *      `versionCode (expr).toInteger()` comme `versionCode(expr).toInteger()` :
 *      l'argument passé au setter est alors la CHAÎNE, et `.toInteger()`
 *      s'applique au retour du setter — mesuré le 2026-09-12,
 *      `IllegalArgumentException: Value is null` sur `BeanDynamicObject`.
 *      Une garde qui n'exige que le nom de la propriété accepte donc la forme
 *      qui casse la construction, et c'est exactement celle qu'on a écrite en
 *      premier : l'exigence de forme doit couvrir la panne CONSTATÉE, sinon
 *      elle ne garde que ce qu'on savait déjà.
 */
const ANDROID_VERSION_CODE_LINE_RE = /versionCode\b([^\n]*)/;

export function auditAndroidVersionCodeForm(gradleText) {
  const match = ANDROID_VERSION_CODE_LINE_RE.exec(stripGradleComments(gradleText));
  if (match === null) {
    return ['aucun "versionCode" trouvé dans build.gradle — le fichier a-t-il changé de forme ?'];
  }
  const rhs = match[1].trim();
  const violations = [];
  if (!rhs.startsWith('=')) {
    violations.push(
      `versionCode "${rhs}" n'est pas une AFFECTATION — Groovy parse « versionCode (expr).toInteger() » ` +
        'comme « versionCode(expr).toInteger() » (le setter reçoit la chaîne, puis .toInteger() s\'applique ' +
        "à son retour : « Value is null », mesuré). Écrire « versionCode = (…) » (D-45).",
    );
  }
  if (!rhs.includes('meeshyBuildNumber')) {
    violations.push(
      `versionCode "${rhs}" est une littérale — il doit LIRE meeshyBuildNumber ` +
        "(project.findProperty('meeshyBuildNumber')), posé par scripts/build-shells.mjs à la construction (D-45).",
    );
  }
  return violations;
}

/**
 * Ce que les deux fichiers SUIVIS annoncent quand la construction ne passe PAS
 * par le site unique (Android Studio, Xcode, `./gradlew` à la main) : `1`, et
 * `1` seulement (D-45). C'est la moitié de la doctrine qu'aucune garde ne
 * tenait — le numéro de build ne se commet jamais, mais son REPLI, si, et un
 * repli qui ressemble à un vrai numéro (`4711`) rend le build d'un poste
 * indiscernable d'un build numéroté. `1` est une ABSENCE lisible.
 */
const IOS_CURRENT_PROJECT_VERSION_RE = /CURRENT_PROJECT_VERSION = ([^;]+);/g;
const ANDROID_BUILD_NUMBER_FALLBACK_RE = /meeshyBuildNumber'\)\s*\?:\s*'([^']*)'/;

export function auditCommittedBuildNumberFallback({ gradleText, pbxprojText }) {
  const violations = [];

  const gradleFallback = ANDROID_BUILD_NUMBER_FALLBACK_RE.exec(stripGradleComments(gradleText));
  if (gradleFallback === null) {
    violations.push(
      "build.gradle ne porte aucun repli « ?: '1' » derrière meeshyBuildNumber — une construction hors du " +
        'site unique doit annoncer 1, jamais échouer ni inventer un numéro (D-45).',
    );
  } else if (gradleFallback[1] !== '1') {
    violations.push(
      `build.gradle replie meeshyBuildNumber sur "${gradleFallback[1]}" — attendu "1" : le repli est la MARQUE ` +
        "d'un build fait hors du site unique, et il ne doit pas ressembler à un numéro de build (D-45).",
    );
  }

  const pbxMatches = [...pbxprojText.matchAll(IOS_CURRENT_PROJECT_VERSION_RE)];
  if (pbxMatches.length === 0) {
    violations.push('project.pbxproj ne porte aucun CURRENT_PROJECT_VERSION — le fichier a-t-il changé de forme ?');
  }
  for (const m of pbxMatches) {
    if (m[1].trim() !== '1') {
      violations.push(
        `project.pbxproj porte "${m[0]}" — attendu 1 : le numéro de build VOYAGE en surcharge xcodebuild ` +
          "(D-45), le fichier ne porte que la marque d'un build fait hors du site unique.",
      );
    }
  }

  return violations;
}

/**
 * Les arguments natifs qui font VOYAGER le numéro de build (D-45) jusqu'à
 * gradle et xcodebuild — pure et exportée pour un témoin d'EFFET, jamais
 * seulement de forme (le pilote appelle exactement cette fonction).
 *
 * Fail-closed sur la destination iOS : un `udid` absent composait
 * `-destination id=undefined` en silence, et un `udid` de RÉFÉRENCE enverrait
 * la coque sur le simulateur de l'app NATIVE (leçon 554). La loi vit déjà
 * dans `resolveShellSimulatorUdid` ; elle est rejouée ICI parce que c'est ce
 * site qui COMPOSE la ligne de commande — et parce qu'un témoin qui se
 * contente de vérifier que la sortie ne CONTIENT pas l'UDID de référence, en
 * n'ayant jamais passé cet UDID, ne peut pas tomber.
 */
export function nativeBuildArgs({ target, buildNumber, version, udid }) {
  if (target === 'android') {
    return ['assembleDebug', `-PmeeshyBuildNumber=${buildNumber}`];
  }
  if (typeof udid !== 'string' || udid.trim() === '') {
    throw new Error(
      "nativeBuildArgs({ target: 'ios' }) exige un udid — sans lui, xcodebuild recevait " +
        '`-destination id=undefined` et échouait sur une destination introuvable.',
    );
  }
  if (udid === REFERENCE_IOS_SIMULATOR_UDID) {
    throw new Error(
      `udid="${udid}" est le simulateur de RÉFÉRENCE (« Meeshy Ref-Native », l'app NATIVE iOS y vit, D-1) : ` +
        `la coque ne s'y construit ni ne s'y installe JAMAIS (leçon 554). Utiliser "${SHELL_IOS_SIMULATOR_UDID}".`,
    );
  }
  return [
    '-project',
    'ios/App/App.xcodeproj',
    '-scheme',
    'App',
    '-destination',
    `id=${udid}`,
    `CURRENT_PROJECT_VERSION=${buildNumber}`,
    `MARKETING_VERSION=${version}`,
    'build',
  ];
}

/**
 * Audite l'APK CONSTRUIT (`output-metadata.json` d'AGP) contre ce que la
 * construction a demandé — ferme M2 (aucun témoin ne portait sur l'artefact
 * réel, seulement sur les fichiers projet AVANT construction).
 */
export function auditBuiltApkVersion(outputMetadataJson, { version, buildNumber }) {
  let parsed;
  try {
    parsed = JSON.parse(outputMetadataJson);
  } catch (err) {
    return [`output-metadata.json illisible : ${err instanceof Error ? err.message : String(err)}`];
  }
  const element = Array.isArray(parsed?.elements) ? parsed.elements[0] : undefined;
  if (element === undefined) {
    return ['output-metadata.json ne porte aucun élément — la construction a-t-elle produit un APK ?'];
  }

  const violations = [];
  if (element.versionName !== version) {
    violations.push(
      `l'APK construit porte versionName="${element.versionName}" — attendu "${version}" (package.json).`,
    );
  }
  if (element.versionCode !== buildNumber) {
    violations.push(
      `l'APK construit porte versionCode=${element.versionCode} — attendu ${buildNumber} (le numéro de build demandé).`,
    );
  }
  return violations;
}

/**
 * Audite l'`App.app` CONSTRUITE (son `Info.plist`, converti en JSON par
 * `plutil -convert json`) contre ce que la construction a demandé.
 */
export function auditBuiltIosAppVersion(infoPlistJson, { version, buildNumber }) {
  let parsed;
  try {
    parsed = JSON.parse(infoPlistJson);
  } catch (err) {
    return [`Info.plist (JSON) illisible : ${err instanceof Error ? err.message : String(err)}`];
  }

  const violations = [];
  if (parsed?.CFBundleShortVersionString !== version) {
    violations.push(
      `l'App.app construite porte CFBundleShortVersionString="${parsed?.CFBundleShortVersionString}" — attendu "${version}".`,
    );
  }
  if (String(parsed?.CFBundleVersion ?? '') !== String(buildNumber)) {
    violations.push(
      `l'App.app construite porte CFBundleVersion="${parsed?.CFBundleVersion}" — attendu "${buildNumber}".`,
    );
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Le pilote — non testé en bun (spawnSync réel, gradle/xcodebuild) ; les
// fonctions pures ci-dessus le sont, via `build-shells.test.ts`.
// ---------------------------------------------------------------------------

function readTextFiles(paths, root) {
  return paths
    .filter((p) => /\.(?:js|mjs|html|json)$/.test(p))
    .map((p) => ({ path: p.slice(root.length + 1), text: readFileSync(p, 'utf8') }));
}

function run(cmd, args, options, label) {
  console.log(`  ${label} : ${cmd} ${args.join(' ')}`);
  const startedAt = Date.now();
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\n  ${label} a échoué (${seconds}s, code ${result.status}) — voir la sortie ci-dessus.\n`);
    process.exit(result.status ?? 1);
  }
  console.log(`  ${label} : ok (${seconds}s)`);
}

function parseArgv(argv) {
  const targetIndex = argv.indexOf('--target');
  const target = targetIndex !== -1 ? argv[targetIndex + 1] : undefined;
  const noNative = argv.includes('--no-native');
  return { target, noNative };
}

async function main() {
  const { target: cliTarget, noNative } = parseArgv(process.argv.slice(2));
  const { apiBase, target } = resolveShellBuildEnv({ ...process.env, target: cliTarget });

  console.log(`  cible : ${target}${noNative ? ' (--no-native : pas de gradle/xcodebuild)' : ''}`);
  console.log(`  base d'API : ${apiBase}`);

  // 1. Construction de la variante B DANS dist/ — jamais dist-capacitor/ :
  //    capacitor.config.ts:167 (webDir: 'dist') est le contrat que `cap sync`
  //    lit, et c'est exactement le piège documenté au README § coques que ce
  //    script rend impossible à rejouer par erreur.
  rmSync(join(APP, 'dist'), { recursive: true, force: true });
  run(
    'bunx',
    ['vite', 'build'],
    {
      cwd: APP,
      env: {
        ...process.env,
        MEESHY_TARGET: 'capacitor',
        VITE_API_BASE: apiBase,
        VITE_DATA_SOURCE: 'gateway',
      },
    },
    'construction de la variante B (dist/)',
  );

  // 2. Audit du bundle — ferme M2 avant de synchroniser quoi que ce soit.
  const bundleFiles = readTextFiles(allFiles(join(APP, 'dist')), join(APP, 'dist'));
  const bundleViolations = auditShellBundle(bundleFiles, { apiBase });
  if (bundleViolations.length > 0) {
    console.error('\n  le dist construit ne respecte pas le contrat de recette :\n');
    for (const v of bundleViolations) console.error(`    · ${v}`);
    console.error('');
    process.exit(1);
  }
  console.log('  audit du bundle : aucun marqueur de fixture, base d’API inlinée — ok');

  // 3. Synchronisation — SANS MEESHY_SHELL_START_PATH (déjà refusé à l'étape 1).
  const capTargets = target === 'both' ? [] : [target];
  run('bunx', ['cap', 'sync', ...capTargets], { cwd: APP, env: process.env }, 'synchronisation Capacitor');

  // 4. Audit des configs synchronisées — ferme M1.
  const syncedConfigs = [
    target !== 'ios' ? join(APP, 'android/app/src/main/assets/capacitor.config.json') : null,
    target !== 'android' ? join(APP, 'ios/App/App/capacitor.config.json') : null,
  ].filter((p) => p !== null);

  const configViolations = syncedConfigs.flatMap((p) => {
    const violations = auditSyncedShellConfig(readFileSync(p, 'utf8'));
    return violations.map((v) => `${p.slice(APP.length + 1)} : ${v}`);
  });
  if (configViolations.length > 0) {
    console.error('\n  la coque synchronisée ne respecte pas le contrat de livraison :\n');
    for (const v of configViolations) console.error(`    · ${v}`);
    console.error('');
    process.exit(1);
  }
  console.log('  audit des coques synchronisées : ok');

  // 4.5. Dérivation du numéro de version (#6196) — les deux coques ne
  //      portent JAMAIS "1.0" en littéral, elles LISENT package.json à
  //      chaque construction (source unique, jamais recopiée à la main).
  const shellVersion = resolveShellVersion(readFileSync(join(APP, 'package.json'), 'utf8'));
  console.log(`  version dérivée de package.json : ${shellVersion}`);

  if (target !== 'ios') {
    const gradlePath = join(APP, 'android/app/build.gradle');
    writeFileSync(gradlePath, deriveAndroidVersionName(readFileSync(gradlePath, 'utf8'), shellVersion));
  }
  if (target !== 'android') {
    const pbxprojPath = join(APP, 'ios/App/App.xcodeproj/project.pbxproj');
    writeFileSync(pbxprojPath, deriveIosMarketingVersion(readFileSync(pbxprojPath, 'utf8'), shellVersion));
  }

  if (noNative) {
    console.log('\n  --no-native : construction native sautée.\n');
    return;
  }

  // 4.6. Numéro de BUILD (D-45) — un fait de CONSTRUCTION, distinct de la
  //      VERSION ci-dessus (un fait de PRODUIT) : UNE source, jamais commise.
  const shallow = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: APP })
    .stdout.toString()
    .trim() === 'true';
  const commitCount = Number(
    spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: APP }).stdout.toString().trim(),
  );
  const buildNumber = resolveShellBuildNumber({ env: process.env, commitCount, shallow });
  console.log(
    `  numéro de build : ${buildNumber} (${
      process.env.MEESHY_SHELL_BUILD_NUMBER !== undefined ? 'MEESHY_SHELL_BUILD_NUMBER' : 'compte de commits de HEAD'
    })`,
  );

  // 5. Construction native — le numéro de build VOYAGE en argument, jamais
  //    commis dans un fichier suivi (D-45).
  if (target !== 'ios') {
    run(
      './gradlew',
      nativeBuildArgs({ target: 'android', buildNumber, version: shellVersion }),
      {
        cwd: join(APP, 'android'),
        env: {
          ...process.env,
          JAVA_HOME: process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21',
          ANDROID_HOME: process.env.ANDROID_HOME ?? join(process.env.HOME ?? '', 'android-sdk'),
        },
      },
      'construction Android (assembleDebug)',
    );

    const outputMetadataPath = join(
      APP,
      'android/app/build/outputs/apk/debug/output-metadata.json',
    );
    if (!existsSync(outputMetadataPath)) {
      console.error(
        `\n  gradle a rendu 0 mais n'a produit aucun ${outputMetadataPath.slice(APP.length + 1)} : ` +
          "l'audit de l'artefact ne peut pas s'exécuter, et un audit qu'on ne peut pas exécuter n'est pas un " +
          'audit vert.\n',
      );
      process.exit(1);
    }
    const apkViolations = auditBuiltApkVersion(readFileSync(outputMetadataPath, 'utf8'), {
      version: shellVersion,
      buildNumber,
    });
    if (apkViolations.length > 0) {
      console.error("\n  l'APK construit ne porte pas la version demandée :\n");
      for (const v of apkViolations) console.error(`    · ${v}`);
      console.error('');
      process.exit(1);
    }
    console.log(`  audit de l'APK construit : versionName ${shellVersion}, versionCode ${buildNumber} — ok`);
    console.log(`\n  APK : android/app/build/outputs/apk/debug/app-debug.apk`);
    console.log(
      '  installation AVD : adb install -r android/app/build/outputs/apk/debug/app-debug.apk && ' +
        'adb shell am start -n me.meeshy.app/.MainActivity',
    );
  }

  if (target !== 'android') {
    const udid = resolveShellSimulatorUdid(process.env);
    run(
      'xcodebuild',
      nativeBuildArgs({ target: 'ios', buildNumber, version: shellVersion, udid }),
      { cwd: APP, env: process.env },
      'construction iOS (xcodebuild)',
    );

    const builtInfoPlistPath = join(
      APP,
      'ios/App/Build/Products/Debug-iphonesimulator/App.app/Info.plist',
    );
    if (!existsSync(builtInfoPlistPath)) {
      console.error(
        `\n  xcodebuild a rendu 0 mais n'a produit aucun ${builtInfoPlistPath.slice(APP.length + 1)} : ` +
          "l'audit de l'artefact ne peut pas s'exécuter, et un audit qu'on ne peut pas exécuter n'est pas un " +
          'audit vert.\n',
      );
      process.exit(1);
    }
    const plutil = spawnSync('plutil', ['-convert', 'json', '-o', '-', builtInfoPlistPath], {
      encoding: 'utf8',
    });
    if (plutil.status !== 0) {
      console.error(
        `\n  plutil a échoué (code ${plutil.status}) sur l'Info.plist construit : ${
          (plutil.stderr ?? '').toString().trim() || 'aucune sortie d’erreur'
        }\n`,
      );
      process.exit(1);
    }
    const appViolations = auditBuiltIosAppVersion(plutil.stdout, { version: shellVersion, buildNumber });
    if (appViolations.length > 0) {
      console.error("\n  l'App.app construite ne porte pas la version demandée :\n");
      for (const v of appViolations) console.error(`    · ${v}`);
      console.error('');
      process.exit(1);
    }
    console.log(
      `  audit de l'App.app construite : CFBundleShortVersionString ${shellVersion}, CFBundleVersion ${buildNumber} — ok`,
    );
    console.log(`\n  App.app : ios/App/Build/Products/Debug-iphonesimulator/App.app`);
    console.log(
      `  installation simulateur : xcrun simctl install ${udid} ` +
        'ios/App/Build/Products/Debug-iphonesimulator/App.app && ' +
        `xcrun simctl launch ${udid} me.meeshy.app`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\n  build-shells.mjs a échoué :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
