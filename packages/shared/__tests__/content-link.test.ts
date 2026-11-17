import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contentLinkTarget,
  contentPathTarget,
  contentWebUrl,
  CONTENT_WEB_PATHS,
  isContentKind,
  MEESHY_WEB_HOSTS,
} from '../utils/content-link';
import { PERSON_LINK_HOSTS } from '../utils/person-link';

const ID = '66f0c0ffee0000000000c0de';

type Vecteur = { readonly _label: string; readonly input: string; readonly expected: unknown };

const VECTEURS = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'content-link', 'content-link.vectors.json'), 'utf8'),
) as readonly Vecteur[];

describe('les vecteurs partagés (fixtures/content-link), que Swift et Kotlin rejouent', () => {
  it('existent, et couvrent les deux issues et le refus', () => {
    expect(VECTEURS.length).toBeGreaterThanOrEqual(30);
    const kinds = new Set(VECTEURS.map((v) => (v.expected === null ? 'null' : (v.expected as { kind: string }).kind)));
    expect([...kinds].sort()).toEqual(['content', 'null', 'tracked']);
  });

  it.each(VECTEURS.map((v) => [v._label, v] as const))('%s', (_label, vecteur) => {
    expect(contentLinkTarget(vecteur.input)).toEqual(vecteur.expected);
  });
});

describe('contentLinkTarget : le lien d’un post, d’un réel, d’une story ou d’une humeur', () => {
  it('lit l’identifiant et le type des adresses de chaque contenu', () => {
    expect(contentLinkTarget(`https://meeshy.me/post/${ID}`)).toEqual({ kind: 'content', postId: ID, type: 'POST' });
    expect(contentLinkTarget(`https://meeshy.me/reel/${ID}`)).toEqual({ kind: 'content', postId: ID, type: 'REEL' });
    expect(contentLinkTarget(`https://meeshy.me/story/${ID}`)).toEqual({ kind: 'content', postId: ID, type: 'STORY' });
    expect(contentLinkTarget(`https://meeshy.me/mood/${ID}`)).toEqual({ kind: 'content', postId: ID, type: 'STATUS' });
  });

  it('lit les formes anciennes, dont le type se lit sur le contenu', () => {
    expect(contentLinkTarget(`https://meeshy.me/feeds/post/${ID}`)).toEqual({ kind: 'content', postId: ID, type: null });
    expect(contentLinkTarget(`https://meeshy.me/p/${ID}`)).toEqual({ kind: 'content', postId: ID, type: null });
    expect(contentLinkTarget(`https://meeshy.me/s/${ID}`)).toEqual({ kind: 'content', postId: ID, type: 'STORY' });
  });

  it('lit le jeton d’un lien suivi, que la passerelle résout', () => {
    expect(contentLinkTarget('https://meeshy.me/l/Ab3xYz')).toEqual({ kind: 'tracked', token: 'Ab3xYz' });
    expect(contentLinkTarget('https://staging.meeshy.me/l/a_b-9/')).toEqual({ kind: 'tracked', token: 'a_b-9' });
  });

  it('tolère la barre finale, la requête, l’ancre, la casse de l’hôte, les espaces et www', () => {
    expect(contentLinkTarget(`https://meeshy.me/reel/${ID}/`)).toEqual({ kind: 'content', postId: ID, type: 'REEL' });
    expect(contentLinkTarget(`https://MEESHY.me/post/${ID}?utm_source=x#c`)).toEqual({ kind: 'content', postId: ID, type: 'POST' });
    expect(contentLinkTarget(`  https://www.meeshy.me/story/${ID}  `)).toEqual({ kind: 'content', postId: ID, type: 'STORY' });
    expect(contentLinkTarget(`https://staging.meeshy.me/mood/${ID}`)).toEqual({ kind: 'content', postId: ID, type: 'STATUS' });
    expect(contentLinkTarget(`https://meeshy.me/post/${ID.toUpperCase()}`)).toEqual({ kind: 'content', postId: ID.toUpperCase(), type: 'POST' });
  });

  it('ne lit rien hors des hôtes Meeshy, ni sur un autre chemin, ni sur un autre schéma', () => {
    for (const lien of [
      `https://evil.example/post/${ID}`,
      `https://meeshy.me.evil.example/post/${ID}`,
      `https://evilmeeshy.me/post/${ID}`,
      `https://user@meeshy.me/post/${ID}`,
      `https://meeshy.me:8443/post/${ID}`,
      `http://meeshy.me/post/${ID}`,
      `meeshy://post/${ID}`,
      `javascript:alert(1)//meeshy.me/post/${ID}`,
      `https://meeshy.me/post/${ID}/comments`,
      'https://meeshy.me/post/123',
      `https://meeshy.me/post/${ID}0`,
      'https://meeshy.me/post/',
      `https://meeshy.me/posts/${ID}`,
      `https://meeshy.me/feeds/${ID}`,
      `https://meeshy.me/u/amani`,
      `https://meeshy.me/chat/mshy_abc`,
      'https://meeshy.me/l/a',
      `https://meeshy.me/l/${'a'.repeat(51)}`,
      'https://meeshy.me/l/a.b',
      'https://meeshy.me/l/Ab3xYz/expired',
      'pas une adresse',
      '',
    ]) {
      expect(contentLinkTarget(lien)).toBeNull();
    }
  });

  it('reconnaît les mêmes hôtes que la fiche', () => {
    expect([...MEESHY_WEB_HOSTS].sort()).toEqual(['meeshy.me', 'staging.meeshy.me', 'www.meeshy.me']);
    expect(PERSON_LINK_HOSTS).toBe(MEESHY_WEB_HOSTS);
  });
});

describe('contentPathTarget : le chemin d’une adresse de contenu, pour la passerelle', () => {
  it('lit le chemin seul, sans hôte', () => {
    expect(contentPathTarget(`/reel/${ID}`)).toEqual({ postId: ID, type: 'REEL' });
    expect(contentPathTarget(`/feeds/post/${ID}/`)).toEqual({ postId: ID, type: null });
    expect(contentPathTarget(`/l/Ab3xYz`)).toBeNull();
    expect(contentPathTarget(`/reel/${ID}/x`)).toBeNull();
  });
});

describe('contentWebUrl : l’adresse canonique d’un contenu', () => {
  it('compose l’adresse que frappe le partage suivi', () => {
    expect(contentWebUrl('https://meeshy.me', 'POST', ID)).toBe(`https://meeshy.me/post/${ID}`);
    expect(contentWebUrl('https://meeshy.me/', 'STATUS', ID)).toBe(`https://meeshy.me/mood/${ID}`);
    expect(Object.keys(CONTENT_WEB_PATHS).sort()).toEqual(['POST', 'REEL', 'STATUS', 'STORY']);
  });

  it('toute adresse composée se relit vers le même contenu', () => {
    for (const type of ['POST', 'REEL', 'STORY', 'STATUS'] as const) {
      expect(contentLinkTarget(contentWebUrl('https://meeshy.me', type, ID))).toEqual({ kind: 'content', postId: ID, type });
    }
  });
});

describe('isContentKind', () => {
  it('ne reconnaît que les quatre types de contenu', () => {
    expect(['POST', 'REEL', 'STORY', 'STATUS'].every(isContentKind)).toBe(true);
    expect(['EXTERNAL', 'CONVERSATION', 'post', null, undefined, 3].some(isContentKind)).toBe(false);
  });
});
