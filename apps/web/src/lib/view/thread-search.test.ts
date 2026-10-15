import { describe, expect, test } from 'bun:test';

import { message } from '@/lib/api/fixtures-base';
import type { Message, Participant } from '@/lib/api/types';

import {
  searchHitOf,
  searchLandingMode,
  searchNeedle,
  searchStatusKey,
  snippetOf,
  THREAD_SEARCH_DEBOUNCE_MS,
} from './thread-search';

/**
 * LES LOIS PURES DE LA RECHERCHE DANS LA CONVERSATION — miroir de
 * `ConversationSearchHandler.swift` : le seuil de deux caractères, l'original
 * qui prime sur la traduction, l'extrait qui montre POURQUOI le message est
 * sorti, la ligne d'état, et l'atterrissage hors du Résumé Vivant.
 */

const at = new Date('2026-10-14T10:00:00.000Z');
const sender = { id: 'p-ada', displayName: 'Ada', user: { id: 'u-ada', username: 'ada' } } as unknown as Participant;
const row = (fields: Partial<Message> & { readonly content: string }): Message =>
  message({ id: 'm1', senderId: 'u-ada', sender, originalLanguage: 'fr', translations: [], createdAt: at, ...fields });

describe('searchNeedle — le seuil de la passerelle (`minLength: 2`)', () => {
  test('sous deux caractères rognés, rien ne part', () => {
    expect(searchNeedle('')).toBeNull();
    expect(searchNeedle('a')).toBeNull();
    expect(searchNeedle('  a  ')).toBeNull();
  });

  test('au seuil, la requête part ROGNÉE', () => {
    expect(searchNeedle(' bo ')).toBe('bo');
  });

  test('l’anti-rebond est celui d’iOS', () => {
    expect(THREAD_SEARCH_DEBOUNCE_MS).toBe(400);
  });
});

describe('snippetOf — l’extrait autour de l’occurrence', () => {
  test('l’occurrence garde la casse du TEXTE', () => {
    expect(snippetOf('Le Déploiement a fini', 'déploiement')).toEqual({ before: 'Le ', match: 'Déploiement', after: ' a fini' });
  });

  test('un long texte est coupé des deux côtés, avec des points de suspension', () => {
    const text = `${'a'.repeat(100)} cible ${'b'.repeat(200)}`;
    const snippet = snippetOf(text, 'cible');
    expect(snippet.match).toBe('cible');
    expect(snippet.before.startsWith('…')).toBe(true);
    expect(snippet.after.endsWith('…')).toBe(true);
    expect(snippet.before.length + snippet.after.length).toBeLessThan(130);
  });

  test('les retours à la ligne sont aplatis', () => {
    expect(snippetOf('un\n\ndeux  trois', 'deux').before).toBe('un ');
  });

  test('sans occurrence, le début du texte sans marque', () => {
    expect(snippetOf('rien ici', 'zut')).toEqual({ before: '', match: '', after: 'rien ici' });
  });
});

describe('searchHitOf — miroir de `buildSearchResult` iOS', () => {
  test('l’original prime', () => {
    const hit = searchHitOf(row({ content: 'Bonjour à tous' }), 'bonjour');
    expect(hit).toMatchObject({ messageId: 'm1', senderName: 'Ada', matchedIn: 'content' });
    expect(hit.snippet.match).toBe('Bonjour');
    expect(hit.createdAt.toISOString()).toBe(at.toISOString());
  });

  test('sinon la traduction qui contient le mot, signalée comme telle', () => {
    const hit = searchHitOf(
      row({
        content: 'Good morning',
        translations: [{ id: 't', messageId: 'm1', targetLanguage: 'fr', translatedContent: 'Bonjour le matin', translationModel: 'basic', createdAt: at }],
      }),
      'bonjour',
    );
    expect(hit.matchedIn).toBe('translation');
    expect(hit.snippet).toEqual({ before: '', match: 'Bonjour', after: ' le matin' });
  });

  test('le nom retombe sur le compte quand le participant n’en porte pas', () => {
    const anonymous = { id: 'p-x', displayName: '', user: { id: 'u-x', username: 'xavier' } } as unknown as Participant;
    expect(searchHitOf(row({ content: 'salut', sender: anonymous }), 'sa').senderName).toBe('xavier');
  });
});

describe('searchStatusKey — la ligne d’état', () => {
  test('avant le seuil, l’aide', () => {
    expect(searchStatusKey({ ready: false, phase: 'idle', count: 0 })).toBe('thread.search.hint');
  });
  test('en vol sans résultat : « Recherche… »', () => {
    expect(searchStatusKey({ ready: true, phase: 'loading', count: 0 })).toBe('thread.search.searching');
  });
  test('répondu vide : « Aucun résultat »', () => {
    expect(searchStatusKey({ ready: true, phase: 'done', count: 0 })).toBe('thread.search.empty');
  });
  test('échec : réessayable', () => {
    expect(searchStatusKey({ ready: true, phase: 'failed', count: 0 })).toBe('thread.search.failed');
  });
  test('le compte, au singulier et au pluriel', () => {
    expect(searchStatusKey({ ready: true, phase: 'done', count: 1 })).toBe('thread.search.count.one');
    expect(searchStatusKey({ ready: true, phase: 'done', count: 3 })).toBe('thread.search.count.other');
  });
});

describe('searchLandingMode — le Résumé Vivant repasse en script, rien d’autre ne bouge', () => {
  test('summary → script', () => {
    expect(searchLandingMode('summary')).toBe('script');
  });
  test('focal, script, bulles ou inconnu : le choix du lecteur est gardé', () => {
    expect(searchLandingMode('focal')).toBeNull();
    expect(searchLandingMode('script')).toBeNull();
    expect(searchLandingMode('bubbles')).toBeNull();
    expect(searchLandingMode(undefined)).toBeNull();
  });
});
