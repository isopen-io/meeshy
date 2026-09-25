import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAppPath } from '@/routes/app-paths';

import { cheminDuLienEntrant } from './shell-deep-links';

/**
 * LES APP LINKS DE LA COQUE NE RÉCLAMENT QUE CE QUE L'APP SERT (#5819).
 *
 * Un chemin réclamé par `AndroidManifest.xml` sans écran dans la table des
 * routes ouvrirait l'app sur RIEN — le système ne rend plus la main au
 * navigateur une fois le lien vérifié. Ce témoin lit le manifeste LIVRÉ et
 * exige, pour chaque chemin réclamé, que le routeur le serve.
 */
const MANIFEST = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../android/app/src/main/AndroidManifest.xml'), 'utf8').replace(
  /<!--[\s\S]*?-->/g,
  '',
);

const filtres = [...MANIFEST.matchAll(/<intent-filter([^>]*)>([\s\S]*?)<\/intent-filter>/g)].map(([, attributs, corps]) => ({
  attributs: attributs ?? '',
  corps: corps ?? '',
}));
const valeurs = (corps: string, attribut: string): string[] =>
  [...corps.matchAll(new RegExp(`android:${attribut}="([^"]*)"`, 'g'))].map(([, valeur]) => valeur ?? '');

const appLinks = filtres.find(({ corps }) => valeurs(corps, 'scheme').includes('https'));
const schemaCourt = filtres.find(({ corps }) => valeurs(corps, 'scheme').includes('meeshy'));

const cheminsReclames = (): string[] => [
  ...valeurs(appLinks?.corps ?? '', 'pathPrefix').map((prefixe) => (prefixe.endsWith('/') ? `${prefixe}x` : prefixe)),
  ...valeurs(appLinks?.corps ?? '', 'path'),
];

describe('App Links de la coque Android', () => {
  test('meeshy.me est réclamé avec vérification, ouvert au navigateur', () => {
    expect(appLinks?.attributs).toContain('android:autoVerify="true"');
    expect(valeurs(appLinks?.corps ?? '', 'host')).toEqual(['meeshy.me', 'www.meeshy.me']);
    expect(appLinks?.corps).toContain('android.intent.action.VIEW');
    expect(appLinks?.corps).toContain('android.intent.category.BROWSABLE');
  });

  test('le filtre ne réclame pas TOUT le domaine', () => {
    expect(cheminsReclames().length).toBeGreaterThan(0);
  });

  test('chaque chemin réclamé est servi par le routeur', () => {
    expect(cheminsReclames().filter((chemin) => !isAppPath(chemin))).toEqual([]);
  });

  test('le fil — le lien le plus partagé — arrive à son écran', () => {
    expect(cheminDuLienEntrant('https://meeshy.me/c/c-deploiement', isAppPath)).toBe('/c/c-deploiement');
    expect(cheminDuLienEntrant('meeshy://c/c-deploiement', isAppPath)).toBe('/c/c-deploiement');
  });

  test('le schéma court meeshy:// est déclaré, sans vérification (aucun domaine à prouver)', () => {
    expect(schemaCourt?.corps).toContain('android.intent.action.VIEW');
    expect(schemaCourt?.attributs ?? '').not.toContain('autoVerify');
  });
});
