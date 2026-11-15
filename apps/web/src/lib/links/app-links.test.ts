import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAppPath } from '@/routes/app-paths';

import { appHandoffUrl } from './app-handoff';
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

  test('chaque chemin réclamé mène à un écran de l’app — directement ou par son ancienne adresse (#10881)', () => {
    expect(cheminsReclames().filter((chemin) => cheminDuLienEntrant(`https://meeshy.me${chemin}`, isAppPath) === null)).toEqual([]);
  });

  test('les anciennes adresses que l’iPhone réclame ouvrent aussi la coque, chacune sur son écran (#10881)', () => {
    expect(['/join/x', '/conversation/x', '/users/x', '/p/x', '/s/x', '/share'].filter((chemin) => !cheminsReclames().includes(chemin))).toEqual([]);
    expect(cheminDuLienEntrant('https://meeshy.me/join/mshy_abc', isAppPath)).toBe('/chat/mshy_abc');
    expect(cheminDuLienEntrant('https://meeshy.me/p/post-1', isAppPath)).toBe('/feeds/post/post-1');
  });

  test('le fil — le lien le plus partagé — arrive à son écran', () => {
    expect(cheminDuLienEntrant('https://meeshy.me/c/c-deploiement', isAppPath)).toBe('/c/c-deploiement');
    expect(cheminDuLienEntrant('meeshy://c/c-deploiement', isAppPath)).toBe('/c/c-deploiement');
  });

  test('le lien de vérification d’e-mail ouvert sur le téléphone arrive à la coque, jeton compris (#8083) — par l’App Link https seul (#10870)', () => {
    expect(cheminsReclames()).toContain('/auth/verify-email');
    expect(cheminDuLienEntrant('https://meeshy.me/auth/verify-email?token=t-1&email=a%40x.io', isAppPath)).toBe(
      '/auth/verify-email?token=t-1&email=a%40x.io',
    );
    expect(cheminDuLienEntrant('meeshy://auth/verify-email?token=t-1&email=a%40x.io', isAppPath)).toBeNull();
  });

  test('la remise du navigateur Android (#8083) arrive à la coque par l’App Link, jeton compris (#10870)', () => {
    const intent = appHandoffUrl('https://meeshy.me/auth/verify-email?token=t-1&email=a%40x.io', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      shell: undefined,
    }) ?? '';
    const [, cible = '', options = ''] = /^intent:\/\/([^#]*)#Intent;(.*)$/.exec(intent) ?? [];
    const schema = /(?:^|;)scheme=([^;]+)/.exec(options)?.[1];
    expect(cheminDuLienEntrant(`${schema}://${cible}`, isAppPath)).toBe('/auth/verify-email?token=t-1&email=a%40x.io');
  });

  test('le lien d’invitation ouvre la coque installée, comme sur iPhone, et y garde son code (#9468)', () => {
    expect(cheminsReclames()).toContain('/signup/affiliate/x');
    expect(cheminDuLienEntrant('https://meeshy.me/signup/affiliate/aff_1-ab', isAppPath)).toBe('/signup/affiliate/aff_1-ab');
  });

  test('le lien d’invitation court ouvre la coque installée, comme sur iPhone, code compris (#9520)', () => {
    expect(cheminsReclames()).toContain('/signup');
    expect(cheminDuLienEntrant('https://meeshy.me/signup?ref=aff_1-ab', isAppPath)).toBe('/signup?ref=aff_1-ab');
  });

  test('World Wide (/world) ouvre la coque installée, comme le web : l’entrée, puis le fil en focus (#10100)', () => {
    expect(cheminsReclames()).toContain('/world');
    expect(cheminDuLienEntrant('https://meeshy.me/world', isAppPath)).toBe('/world');
    expect(cheminDuLienEntrant('meeshy://world', isAppPath)).toBe('/world');
  });

  test('le schéma court meeshy:// est déclaré, sans vérification (aucun domaine à prouver)', () => {
    expect(schemaCourt?.corps).toContain('android.intent.action.VIEW');
    expect(schemaCourt?.attributs ?? '').not.toContain('autoVerify');
  });
});
