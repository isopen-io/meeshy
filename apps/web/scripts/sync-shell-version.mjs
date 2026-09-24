#!/usr/bin/env node
/**
 * LA VERSION DES COQUES SUIT `package.json`, AU MOMENT OÙ ELLE CHANGE (#6196).
 *
 * `build-shells.mjs` DÉRIVE `versionName` (Android) et `MARKETING_VERSION`
 * (iOS) à chaque construction de coque, et `build-shells.test.ts` refuse que
 * les fichiers SUIVIS divergent de `package.json`. Mais la release
 * (`.github/workflows/release.yml`, `bunx changeset version`) monte
 * `apps/web/package.json` SANS construire de coque : le 2026-09-13, `main`
 * portait `2.0.2` dans `package.json` et `2.0.0` dans les deux coques, et
 * « Test web-v2 » y était rouge. Ce script est l'étape qui manquait —
 * appelé juste après `changeset version`, avant le commit de release.
 *
 * Il ne réécrit rien lui-même : les deux dérivations sont celles de
 * `build-shells.mjs`, déjà témoignées. Idempotent — un fichier déjà à jour
 * n'est pas réécrit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveAndroidVersionName, deriveIosMarketingVersion, resolveShellVersion } from './build-shells.mjs';

const APP = new URL('..', import.meta.url).pathname;

const version = resolveShellVersion(readFileSync(join(APP, 'package.json'), 'utf8'));

const targets = [
  { path: join(APP, 'android/app/build.gradle'), derive: deriveAndroidVersionName },
  { path: join(APP, 'ios/App/App.xcodeproj/project.pbxproj'), derive: deriveIosMarketingVersion },
];

for (const { path, derive } of targets) {
  const before = readFileSync(path, 'utf8');
  const after = derive(before, version);
  if (after === before) {
    console.log(`  ${path.replace(APP, '')} porte déjà ${version}`);
    continue;
  }
  writeFileSync(path, after);
  console.log(`  ${path.replace(APP, '')} → ${version}`);
}
