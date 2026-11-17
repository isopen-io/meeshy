import { describe, it, expect } from 'vitest';
import { personHandleFromLink, PERSON_LINK_HOSTS } from '../utils/person-link';

describe('personHandleFromLink : le lien d’une fiche Meeshy collé dans un message', () => {
  it('lit le pseudo de /u/<pseudo> et de /@<pseudo>, en production et en staging', () => {
    expect(personHandleFromLink('https://meeshy.me/u/amani')).toBe('amani');
    expect(personHandleFromLink('https://meeshy.me/@amani')).toBe('amani');
    expect(personHandleFromLink('https://www.meeshy.me/u/Amani_D-2')).toBe('Amani_D-2');
    expect(personHandleFromLink('https://staging.meeshy.me/@amani')).toBe('amani');
  });

  it('tolère la barre finale, la requête et l’ancre, et la casse de l’hôte', () => {
    expect(personHandleFromLink('https://meeshy.me/u/amani/')).toBe('amani');
    expect(personHandleFromLink('https://MEESHY.me/@amani?ref=chat#top')).toBe('amani');
    expect(personHandleFromLink('  https://meeshy.me/u/amani  ')).toBe('amani');
  });

  it('ne lit rien hors des hôtes Meeshy, ni sur un autre chemin, ni sur un autre schéma', () => {
    for (const lien of [
      'https://evil.example/u/amani',
      'https://meeshy.me.evil.example/u/amani',
      'https://evilmeeshy.me/u/amani',
      'https://user@evil.example/u/amani',
      'http://meeshy.me/u/amani',
      'javascript:alert(1)//meeshy.me/u/amani',
      'https://meeshy.me/u/amani/posts',
      'https://meeshy.me/u/ami.ni',
      'https://meeshy.me/u/',
      'https://meeshy.me/@',
      'https://meeshy.me/users/amani',
      `https://meeshy.me/u/${'x'.repeat(65)}`,
      'pas une adresse',
      '',
    ]) {
      expect(personHandleFromLink(lien)).toBeNull();
    }
  });

  it('nomme les hôtes qu’il reconnaît, et aucun autre', () => {
    expect([...PERSON_LINK_HOSTS].sort()).toEqual(['meeshy.me', 'staging.meeshy.me', 'www.meeshy.me']);
  });
});
