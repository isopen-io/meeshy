import type { StoryTrayPost } from './stories';

/**
 * **LE PLATEAU EN FIXTURES** (#6080) — servi par le MÊME chemin que la
 * passerelle (`loadStoryTray`), jamais par une branche de l'écran.
 *
 * Il est écrit pour EXERCER la règle de tri, pas pour faire joli : le lecteur
 * a une story à lui (la plus ancienne), un ami a publié DEUX fois, et l'auteur
 * dont la story est la plus RÉCENTE est déjà vu. Un rail trié par date seule
 * les mettrait exactement dans l'ordre inverse.
 */
export const STORY_TRAY: readonly StoryTrayPost[] = [
  {
    id: 'st-vue-recente',
    type: 'STORY',
    createdAt: '2026-09-11T12:00:00.000Z',
    expiresAt: '2026-09-12T12:00:00.000Z',
    viewCount: 12,
    author: { id: 'u-camille', username: 'camille', displayName: 'Camille Roy' },
    media: [{ id: 'm1', thumbnailUrl: '', mimeType: 'image/jpeg' }],
  },
  {
    id: 'st-amie-1',
    type: 'STORY',
    createdAt: '2026-09-11T09:30:00.000Z',
    expiresAt: '2026-09-12T09:30:00.000Z',
    viewCount: 3,
    author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' },
    media: [{ id: 'm2', thumbnailUrl: '', mimeType: 'image/jpeg' }],
  },
  {
    id: 'st-amie-2',
    type: 'STORY',
    createdAt: '2026-09-11T10:45:00.000Z',
    expiresAt: '2026-09-12T10:45:00.000Z',
    viewCount: 5,
    author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' },
    media: [{ id: 'm3', thumbnailUrl: '', mimeType: 'video/mp4' }],
  },
  {
    id: 'st-mienne',
    type: 'STORY',
    createdAt: '2026-09-11T07:15:00.000Z',
    expiresAt: '2026-09-12T07:15:00.000Z',
    viewCount: 8,
    author: { id: 'u-poc', username: 'moi', displayName: 'Moi' },
    media: [{ id: 'm4', thumbnailUrl: '', mimeType: 'image/jpeg' }],
  },
];
