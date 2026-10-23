import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA COQUE PASSE LES CONTRÔLES DE QUALITÉ DU CODE DE GOOGLE PLAY (#12447).
 *
 * La Play Console note la 2.23.0 : obscurcissement à 2 % pour un seuil de
 * 25 %, et des bitmaps décodés sans sous-échantillonnage.
 */

const ANDROID = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app');
const JAVA = join(ANDROID, 'src', 'main', 'java', 'me', 'meeshy', 'app');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function blocRelease(gradle: string): string {
  const debut = gradle.indexOf('buildTypes');
  return gradle.slice(debut, gradle.indexOf('dependencies', debut));
}

describe('R8 réduit et obscurcit la release (#12447)', () => {
  test('la release active R8, la réduction des ressources et le profil optimisé', () => {
    const release = blocRelease(sansCommentaires(readFileSync(join(ANDROID, 'build.gradle'), 'utf8')));
    expect(release).toContain('minifyEnabled true');
    expect(release).toContain('shrinkResources true');
    expect(release).toContain("getDefaultProguardFile('proguard-android-optimize.txt')");
  });

  test('le plugin de notifications joint par réflexion garde ses deux méthodes', () => {
    const regles = readFileSync(join(ANDROID, 'proguard-rules.pro'), 'utf8');
    const relais = readFileSync(join(JAVA, 'MeeshyMessagingService.java'), 'utf8');
    const plugin = /PLUGIN = "([^"]+)"/.exec(relais)?.[1] ?? '';
    expect(plugin).not.toBe('');
    expect(regles).toContain(`-keep class ${plugin} {`);
    expect(regles).toContain('public static void onNewToken(java.lang.String);');
    expect(regles).toContain('public static void sendRemoteMessage(com.google.firebase.messaging.RemoteMessage);');
  });
});

describe('chaque bitmap est décodé sous-échantillonné (#12447)', () => {
  test('aucun décodage BitmapFactory sans options', () => {
    const decodagesNus = readdirSync(JAVA)
      .filter((nom) => nom.endsWith('.java'))
      .flatMap((nom) =>
        sansCommentaires(readFileSync(join(JAVA, nom), 'utf8'))
          .split('\n')
          .filter((ligne) => /BitmapFactory\.decode\w+\(/.test(ligne) && !/,\s*\w*[oO]ptions\)|,\s*bounds\)/.test(ligne))
          .map((ligne) => `${nom}: ${ligne.trim()}`),
      );
    expect(decodagesNus).toEqual([]);
  });
});
