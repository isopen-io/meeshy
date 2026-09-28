import { describe, expect, test } from 'bun:test';

import type { GallerySaveOutcome, GallerySaver } from '@/lib/gallery/gallery-saver';
import type { DeliverFileOutcome, FileDeliveryPortal } from '@/lib/media/deliver-file';

import { deliverMessageCard } from './deliver-message-card';

const blob = new Blob(['png'], { type: 'image/png' });

const gallery = (outcome: GallerySaveOutcome, journal: string[]): GallerySaver => ({
  available: true,
  save: async ({ fileName, mimeType }) => {
    journal.push(`gallery:${fileName}:${mimeType}`);
    return outcome;
  },
});

const portal = (outcome: DeliverFileOutcome, journal: string[]): FileDeliveryPortal => ({
  deliver: async (_blob, fileName) => {
    journal.push(`portal:${fileName}`);
    return outcome;
  },
});

describe('deliverMessageCard(« Sauvegarder ») — la photothèque d’abord', () => {
  test('la galerie de la coque Android enregistre directement, sans feuille', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: gallery('saved', journal), portal: async () => portal('delivered', journal) })).toBe('gallery');
    expect(journal).toEqual(['gallery:m.png:image/png']);
  });

  test('une galerie en échec retombe sur le partage du système', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: gallery('failed', journal), portal: async () => portal('delivered', journal) })).toBe('shared');
    expect(journal).toEqual(['gallery:m.png:image/png', 'portal:m.png']);
  });

  test('sans galerie : feuille de partage (iOS, Safari) ou téléchargement (bureau)', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: null, portal: async () => portal('delivered', journal) })).toBe('shared');
    expect(journal).toEqual(['portal:m.png']);
  });

  test('une feuille fermée est une annulation, pas un échec', async () => {
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: null, portal: async () => portal('cancelled', []) })).toBe('cancelled');
  });

  test('aucune porte ⇒ indisponible', async () => {
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: null, portal: async () => null })).toBe('unavailable');
  });
});

describe('deliverMessageCard(« Partager ») — toujours la feuille du système', () => {
  test('la galerie n’est jamais touchée : l’utilisateur choisit où envoyer', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'share', { gallery: gallery('saved', journal), portal: async () => portal('delivered', journal) })).toBe('shared');
    expect(journal).toEqual(['portal:m.png']);
  });

  test('une feuille fermée reste une annulation, et sans porte rien ne part', async () => {
    expect(await deliverMessageCard(blob, 'm.png', 'share', { gallery: null, portal: async () => portal('cancelled', []) })).toBe('cancelled');
    expect(await deliverMessageCard(blob, 'm.png', 'share', { gallery: null, portal: async () => null })).toBe('unavailable');
  });
});
