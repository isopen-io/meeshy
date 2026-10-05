import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DEFAULT_USER_PERMISSIONS, type ParticipantPermissions } from '@meeshy/shared/types/participant';

import type { ComposerContactSource } from './composer-attachment-panel';
import ComposerTray from './composer-tray';

/**
 * **LES SEPT SOURCES DU COMPOSEUR (#7280)** — le web en servait TROIS
 * (Photos, Fichier, Vocal) là où iOS en sert sept
 * (`UniversalComposerBar+Attachments.swift:246-298`, qui fait foi).
 *
 * ## CE QUE CE TÉMOIN MESURE, ET POURQUOI CE N'EST PAS LA PRÉSENCE
 *
 * Une tuile RENDUE SANS EFFET est un contrôle qui ment (loi 4), et c'est un
 * défaut PIRE que son absence : le dépôt a déjà livré une zone cliquable qui
 * ne changeait rien (`PostCard`, cycle 123 du `CLAUDE.md` racine). Chaque cas
 * ci-dessous compte donc un EFFET — un gestionnaire appelé avec sa charge —
 * jamais un nœud trouvé dans le DOM.
 *
 * ## ET LA LANGUE SE LIT SUR UN TEXTE QUI N'EST PAS LE FRANÇAIS
 *
 * Les trois libellés existants étaient EN DUR (`label="Photos"`, `"Fichier"`,
 * `"Vocal"`). Asserter « Caméra » verdirait sur un second libellé en dur ; on
 * lit donc l'ALLEMAND, que seul le catalogue peut servir.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('de')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  document.documentElement.lang = 'fr';
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  document.documentElement.lang = 'fr';
});

type Gestures = {
  photos?: (files: FileList | null) => void;
  camera?: (files: readonly File[]) => void;
  file?: (files: FileList | null) => void;
  location?: () => void;
  emoji?: () => void;
  sticker?: () => void;
  voice?: () => void;
};

type PanelOptions = {
  readonly canLocate?: boolean;
  readonly contact?: ComposerContactSource;
  readonly rights?: ParticipantPermissions;
};

function mountPanel(gestures: Gestures = {}, options: PanelOptions = {}): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ComposerTray
        variant="panel"
        onPickPhotos={gestures.photos ?? (() => {})}
        onPickCamera={gestures.camera ?? (() => {})}
        onPickFile={gestures.file ?? (() => {})}
        onRequestLocation={gestures.location ?? (() => {})}
        onRequestEmoji={gestures.emoji ?? (() => {})}
        {...(gestures.sticker === undefined ? {} : { onRequestSticker: gestures.sticker })}
        onStartVoice={gestures.voice ?? (() => {})}
        canRecord
        canLocate={options.canLocate ?? true}
        {...(options.contact === undefined ? {} : { contact: options.contact })}
        {...(options.rights === undefined ? {} : { rights: options.rights })}
      />,
    );
  });
  return container;
}

const sourceOf = (el: HTMLElement, id: string): HTMLElement => {
  const found = el.querySelector<HTMLElement>(`[data-composer-source="${id}"]`);
  if (found === null) throw new Error(`Aucune tuile « ${id} » dans le panneau`);
  return found;
};

/** Le `<input type="file">` d'une tuile, et le `change` que le navigateur y
 * lève une fois l'utilisateur revenu du sélecteur (ou de l'appareil photo). */
function pickFileOn(tile: HTMLElement): void {
  const input = tile.querySelector('input[type="file"]');
  if (input === null) throw new Error('La tuile ne porte aucun champ de fichier');
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('Caméra (#7280) — la source la plus utilisée après Photos', () => {
  test('la tuile PRODUIT un effet : revenir de l’appareil photo remet les fichiers au composeur', async () => {
    const received: Array<readonly File[]> = [];
    const el = mountPanel({ camera: (files) => void received.push(files) });
    pickFileOn(sourceOf(el, 'camera'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(received).toHaveLength(1);
  });

  test('la photo prise passe par le développement unique avant d’être remise (#8695)', async () => {
    const received: Array<readonly File[]> = [];
    const el = mountPanel({ camera: (files) => void received.push(files) });
    const input = sourceOf(el, 'camera').querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('champ absent');
    const shot = new File(['x'], 'IMG_0001.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { configurable: true, get: () => [shot] });
    const decoded: File[] = [];
    const original = globalThis.createImageBitmap;
    globalThis.createImageBitmap = (async (file: File) => {
      decoded.push(file);
      throw new Error('pas de canevas ici');
    }) as unknown as typeof createImageBitmap;
    try {
      act(() => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    } finally {
      globalThis.createImageBitmap = original;
    }
    expect(decoded).toEqual([shot]);
    expect(received).toEqual([[shot]]);
  });

  /**
   * `capture` est CE QUI DISTINGUE la tuile de « Photos » — sans lui, les deux
   * ouvrent la photothèque et la seconde tuile ne fait que doubler la
   * première. Le témoin le lit sur l'ATTRIBUT, pas sur la prop React : c'est
   * l'attribut que le navigateur honore.
   */
  test('elle ouvre la CAMÉRA arrière, jamais la photothèque', () => {
    const el = mountPanel();
    const input = sourceOf(el, 'camera').querySelector('input[type="file"]');
    expect(input?.getAttribute('capture')).toBe('environment');
    expect(input?.getAttribute('accept')).toBe('image/*');
  });

  test('« Photos », elle, ne capture rien — les deux tuiles restent distinctes', () => {
    const el = mountPanel();
    const input = sourceOf(el, 'photo').querySelector('input[type="file"]');
    expect(input?.hasAttribute('capture')).toBe(false);
  });
});

describe('Position (#7280)', () => {
  test('la tuile PRODUIT un effet : elle demande la position', () => {
    let calls = 0;
    const el = mountPanel({ location: () => (calls += 1) });
    act(() => {
      sourceOf(el, 'location').click();
    });
    expect(calls).toBe(1);
  });

  /**
   * LOI 4, l'autre sens — un navigateur sans `navigator.geolocation` ne peut
   * RIEN rendre : la tuile ne se dessine pas, jamais grisée (même discipline
   * que « Vocal » sans `MediaRecorder`).
   */
  test('sans géolocalisation dans le navigateur, la tuile ne se rend PAS', () => {
    const el = mountPanel({}, { canLocate: false });
    expect(el.querySelector('[data-composer-source="location"]')).toBeNull();
  });
});

describe('Emoji (#7280)', () => {
  test('la tuile PRODUIT un effet : elle ouvre la palette', () => {
    let calls = 0;
    const el = mountPanel({ emoji: () => (calls += 1) });
    act(() => {
      sourceOf(el, 'emoji').click();
    });
    expect(calls).toBe(1);
  });
});

describe('les sept libellés viennent du CATALOGUE, aucun n’est en dur (#7280, #6310)', () => {
  test('en allemand, les sources s’annoncent en allemand', () => {
    document.documentElement.lang = 'de';
    const el = mountPanel();
    const labels = [...el.querySelectorAll('[data-composer-source]')].map(
      (tile) => tile.querySelector('[data-composer-source-label]')?.textContent,
    );
    expect(labels).toEqual(['Fotos', 'Kamera', 'Datei', 'Standort', 'Sprache', 'Emoji']);
  });

  /** L'ORDRE est celui d'iOS (dimension 6 : même geste, même place) —
   * photo · caméra · fichier · position · vocal · emoji. */
  test('l’ordre des tuiles est celui d’iOS', () => {
    const el = mountPanel();
    const ids = [...el.querySelectorAll('[data-composer-source]')].map((tile) =>
      tile.getAttribute('data-composer-source'),
    );
    expect(ids).toEqual(['photo', 'camera', 'file', 'location', 'voice', 'emoji']);
  });

  test('le geste de chaque tuile s’annonce lui aussi dans la langue d’interface', () => {
    document.documentElement.lang = 'de';
    const el = mountPanel();
    expect(sourceOf(el, 'camera').querySelector('input')?.getAttribute('aria-label')).toBe('Foto aufnehmen');
    expect(sourceOf(el, 'location').getAttribute('aria-label')).toBe('Meinen Standort teilen');
    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Anhangstypen');
  });
});

describe('Sticker (#7938)', () => {
  test('la tuile PRODUIT un effet : elle ouvre « Mes stickers », après l’emoji comme sur iOS', () => {
    let calls = 0;
    const el = mountPanel({ sticker: () => (calls += 1) });
    act(() => {
      sourceOf(el, 'sticker').click();
    });
    expect(calls).toBe(1);
    const ids = [...el.querySelectorAll('[data-composer-source]')].map((tile) => tile.getAttribute('data-composer-source'));
    expect(ids.slice(-2)).toEqual(['emoji', 'sticker']);
  });

  test('un hôte qui ne monte pas la bibliothèque ne montre pas la tuile', () => {
    const el = mountPanel();
    expect(el.querySelector('[data-composer-source="sticker"]')).toBeNull();
  });
});

describe('Contact (#8242) — la tuile d’iOS, à la même place', () => {
  const gesture = (onRequest: () => void = () => {}): ComposerContactSource => ({
    source: 'picker',
    onRequest,
    onPickFile: () => {},
  });

  test('elle vient après « Fichier », comme sur iOS', () => {
    const el = mountPanel({}, { contact: gesture() });
    const ids = [...el.querySelectorAll('[data-composer-source]')].map((tile) => tile.getAttribute('data-composer-source'));
    expect(ids).toEqual(['photo', 'camera', 'file', 'contact', 'location', 'voice', 'emoji']);
  });

  test('son libellé et son geste viennent du catalogue', () => {
    document.documentElement.lang = 'de';
    const el = mountPanel({}, { contact: gesture() });
    expect(sourceOf(el, 'contact').querySelector('[data-composer-source-label]')?.textContent).toBe('Kontakt');
    expect(sourceOf(el, 'contact').getAttribute('aria-label')).toBe('Kontakt teilen');
  });

  test('avec un sélecteur (coque ou navigateur), la tuile OUVRE ce sélecteur', () => {
    let calls = 0;
    const el = mountPanel({}, { contact: gesture(() => (calls += 1)) });
    act(() => {
      sourceOf(el, 'contact').click();
    });
    expect(calls).toBe(1);
  });

  test('sans sélecteur, elle ouvre le choix d’une fiche .vcf — jamais inerte', () => {
    let picked = 0;
    const el = mountPanel({}, { contact: { source: 'file', onRequest: () => {}, onPickFile: () => (picked += 1) } });
    const input = sourceOf(el, 'contact').querySelector('input[type="file"]');
    expect(input?.getAttribute('accept')).toContain('.vcf');
    pickFileOn(sourceOf(el, 'contact'));
    expect(picked).toBe(1);
  });

  test('un participant qui n’a pas le droit d’envoyer de fichier ne voit pas la tuile', () => {
    const el = mountPanel({}, { contact: gesture(), rights: { ...DEFAULT_USER_PERMISSIONS, canSendFiles: false } });
    expect(el.querySelector('[data-composer-source="contact"]')).toBeNull();
  });
});
