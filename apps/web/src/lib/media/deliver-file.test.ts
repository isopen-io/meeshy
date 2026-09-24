import { describe, expect, test } from 'bun:test';

import { fileDeliveryPortal } from './deliver-file';

function blob(): Blob {
  return new Blob(['x'], { type: 'image/jpeg' });
}

describe('fileDeliveryPortal — aucune porte ⇒ aucun bouton (loi 4)', () => {
  test('un hôte SANS document ni partage de fichier rend `null`', () => {
    expect(fileDeliveryPortal({})).toBeNull();
  });

  test('un hôte avec `document` + URL d’objet télécharge par une ancre, puis révoque', async () => {
    const appended: HTMLElement[] = [];
    const removed: HTMLElement[] = [];
    const anchor = { href: '', download: '' } as unknown as HTMLAnchorElement & { clicked?: boolean };
    (anchor as unknown as { click: () => void }).click = () => {
      (anchor as unknown as { clicked: boolean }).clicked = true;
    };
    let revoked: string | null = null;
    const portal = fileDeliveryPortal({
      document: {
        createElement: () => anchor as unknown as HTMLElement,
        body: {
          appendChild: (el: HTMLElement) => {
            appended.push(el);
            return el;
          },
          removeChild: (el: HTMLElement) => {
            removed.push(el);
            return el;
          },
        },
      } as never,
      createObjectURL: () => 'blob:1',
      revokeObjectURL: (url) => {
        revoked = url;
      },
    });
    expect(portal).not.toBeNull();
    const outcome = await portal!.deliver(blob(), 'meeshy-m4.jpg', 'image/jpeg');
    expect(outcome).toBe('delivered');
    expect(anchor.download).toBe('meeshy-m4.jpg');
    expect((anchor as unknown as { clicked?: boolean }).clicked).toBe(true);
    expect(appended).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(revoked).toBe('blob:1');
  });

  test('un hôte qui SAIT partager des fichiers appelle le partage avec le bon nom et le bon type', async () => {
    const captured: { files: readonly File[] } = { files: [] };
    const portal = fileDeliveryPortal({
      canShareFiles: () => true,
      shareFiles: async (data) => {
        captured.files = data.files;
      },
    });
    const outcome = await portal!.deliver(blob(), 'meeshy-m4.jpg', 'image/jpeg');
    expect(outcome).toBe('delivered');
    expect(captured.files[0]?.name).toBe('meeshy-m4.jpg');
    expect(captured.files[0]?.type).toBe('image/jpeg');
  });

  test('l’annulation de la feuille de partage (`AbortError`) rend `cancelled`, sans repli', async () => {
    const portal = fileDeliveryPortal({
      canShareFiles: () => true,
      shareFiles: async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
    });
    expect(await portal!.deliver(blob(), 'x.jpg', 'image/jpeg')).toBe('cancelled');
  });

  test('un refus du partage qui n’est PAS une annulation retombe sur le téléchargement', async () => {
    let downloaded = false;
    const anchor = { href: '', download: '', click: () => {} } as unknown as HTMLAnchorElement;
    const portal = fileDeliveryPortal({
      canShareFiles: () => true,
      shareFiles: async () => {
        throw new Error('no target app');
      },
      document: {
        createElement: () => anchor,
        body: { appendChild: () => { downloaded = true; return anchor; }, removeChild: () => anchor },
      } as never,
      createObjectURL: () => 'blob:1',
      revokeObjectURL: () => {},
    });
    expect(await portal!.deliver(blob(), 'x.jpg', 'image/jpeg')).toBe('delivered');
    expect(downloaded).toBe(true);
  });
});
