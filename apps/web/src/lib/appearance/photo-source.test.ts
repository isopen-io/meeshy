import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { mediaHubConversationKey } from '@/lib/api/media-hub-cache';

import { photoSourceOf } from './photo-source';

const ID = 'a'.repeat(24);

describe('la source de la photo d’un fond', () => {
  test('retrouve la vignette et la pleine définition dans la galerie en cache', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...mediaHubConversationKey('c1'), 'visual', ''], {
      pages: [{ messages: [{ attachments: [{ id: ID, fileUrl: 'https://cdn.x/p.jpg', thumbnailUrl: 'https://cdn.x/t.jpg' }] }] }],
      pageParams: [undefined],
    });
    expect(photoSourceOf(queryClient, 'c1', ID)).toEqual({ thumb: 'https://cdn.x/t.jpg', full: 'https://cdn.x/p.jpg' });
  });

  test('sans galerie en cache, la route de la pièce sert l’image — sans vignette', () => {
    const source = photoSourceOf(new QueryClient(), 'c1', ID);
    expect(source.thumb).toBeNull();
    expect(source.full.endsWith(`/api/v1/attachments/${ID}`)).toBe(true);
  });

  test('ne lit pas la galerie d’une AUTRE conversation', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...mediaHubConversationKey('c2'), 'visual', ''], { pages: [{ messages: [{ attachments: [{ id: ID, fileUrl: 'https://cdn.x/autre.jpg' }] }] }], pageParams: [undefined] });
    expect(photoSourceOf(queryClient, 'c1', ID).full).not.toContain('autre.jpg');
  });
});
