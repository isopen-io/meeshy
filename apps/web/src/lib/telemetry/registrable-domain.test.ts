import { describe, expect, test } from 'bun:test';

import { registrableDomain } from './registrable-domain';

/**
 * LE DOMAINE ENREGISTRABLE D'UN LIEN (#10505) — l'eTLD+1, et rien d'autre :
 * ni chemin, ni requête, ni sous-domaine, ni fragment.
 */
describe('registrableDomain', () => {
  test('https://exemple.co.uk/a?b=c donne exemple.co.uk et rien d’autre', () => {
    expect(registrableDomain('https://exemple.co.uk/a?b=c')).toBe('exemple.co.uk');
  });

  test('un sous-domaine se replie sur le domaine enregistrable', () => {
    expect(registrableDomain('https://news.bbc.co.uk/x')).toBe('bbc.co.uk');
    expect(registrableDomain('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
    expect(registrableDomain('http://m.blog.example.fr/#frag')).toBe('example.fr');
    expect(registrableDomain('https://shop.example.com.br')).toBe('example.com.br');
  });

  test('ni identifiants ni port ne passent', () => {
    expect(registrableDomain('https://user:secret@exemple.org:8443/p')).toBe('exemple.org');
  });

  test('ni adresse IP, ni schéma non web, ni chaîne illisible', () => {
    expect(registrableDomain('http://192.168.1.4/x')).toBeNull();
    expect(registrableDomain('http://[::1]/x')).toBeNull();
    expect(registrableDomain('mailto:a@b.fr')).toBeNull();
    expect(registrableDomain('javascript:alert(1)')).toBeNull();
    expect(registrableDomain('pas une url')).toBeNull();
    expect(registrableDomain('http://localhost/')).toBeNull();
  });
});
