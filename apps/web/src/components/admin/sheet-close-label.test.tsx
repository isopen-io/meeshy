import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { Sheet } from '@/components/sheet';
import { AdminUserBanSheet } from '@/routes/admin-user-ban-sheet';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { routedTransport } from '@/test-support/routed-transport';

import { AdminConfirmSheet } from './confirm-sheet';

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en', 'es', 'pt'] });

const closeButton = (host: ParentNode) => host.querySelector<HTMLButtonElement>('dialog button[aria-label]');

/**
 * **LE BOUTON DE FERMETURE D'UNE FEUILLE PORTE LE NOM DE LA LANGUE DU LECTEUR** (#8876) —
 * `Sheet` écrivait `aria-label="Fermer"` en dur : un lecteur d'écran annonçait « Fermer »,
 * en français, sur chaque feuille de l'administration anglaise, espagnole ou portugaise
 * (et des autres interfaces, qui lisent l'administration en anglais).
 */
describe('Sheet — le nom accessible du bouton de fermeture', () => {
  test('sans closeLabel, la langue d’interface (français ici) — jamais une chaîne écrite en dur', async () => {
    const host = await mount(
      <Sheet title="Pays" onClose={() => undefined}>
        <li>France</li>
      </Sheet>,
    );
    expect(closeButton(host)?.getAttribute('aria-label')).toBe('Fermer');
  });

  test('closeLabel l’emporte : l’hôte qui lit une autre langue passe la sienne', async () => {
    const host = await mount(
      <Sheet title="Country" closeLabel="Close" onClose={() => undefined}>
        <li>France</li>
      </Sheet>,
    );
    expect(closeButton(host)?.getAttribute('aria-label')).toBe('Close');
  });
});

describe('les feuilles d’administration disent « fermer » dans la langue du lecteur', () => {
  const EXPECTED = { en: 'Close', es: 'Cerrar', pt: 'Fechar' } as const;

  for (const language of ['en', 'es', 'pt'] as const) {
    test(`AdminConfirmSheet en ${language} : « ${EXPECTED[language]} », jamais « Fermer »`, async () => {
      const host = await mount(
        <AdminConfirmSheet
          language={language}
          title="t"
          body="b"
          confirmLabel="ok"
          tone="primary"
          busy={false}
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />,
      );
      const label = closeButton(host)?.getAttribute('aria-label');
      expect(label).toBe(EXPECTED[language]);
      expect(label).not.toBe('Fermer');
    });

    test(`la feuille de bannissement en ${language} : « ${EXPECTED[language]} », jamais « Fermer »`, async () => {
      const host = await mount(
        <AdminUserBanSheet
          userId="64f1c2a9e8b7d6c5b4a39281"
          language={language}
          onClose={() => undefined}
          onAnnounce={() => undefined}
          deps={{ source: 'gateway', transport: routedTransport().transport }}
        />,
      );
      await mounter.settle();
      const label = closeButton(host)?.getAttribute('aria-label');
      expect(label).toBe(EXPECTED[language]);
      expect(label).not.toBe('Fermer');
    });
  }
});

/**
 * Le témoin des hôtes qu'un test de rendu n'atteint pas tous (feuille du journal, secret d'un lien,
 * composition d'une diffusion, création de compte, images, mot de passe, conversations, réglages,
 * agent) : tout fichier d'administration qui monte une `<Sheet` lui passe SON `closeLabel`.
 */
describe('toute feuille montée par l’administration passe son closeLabel', () => {
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  const SOURCES = join(HERE, '..', '..', 'routes');
  const KIT = HERE;
  const files = [
    ...readdirSync(SOURCES).filter((name) => /^admin-.*\.tsx$/.test(name) && !name.endsWith('.test.tsx')).map((name) => join(SOURCES, name)),
    ...readdirSync(KIT).filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx')).map((name) => join(KIT, name)),
  ];

  test('chaque <Sheet … > d’un fichier d’administration porte closeLabel', () => {
    const missing = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      /* `<Sheet title=…>` : un élément JSX (jamais le générique `useState<Sheet | null>`), dont les props
         peuvent porter des flèches `=>`. */
      const opens = [...source.matchAll(/<Sheet\s+[a-zA-Z](?:[^>]|=>)*>/gs)];
      return opens.filter((open) => !open[0].includes('closeLabel=')).map(() => file.replace(`${join(HERE, '..', '..')}/`, ''));
    });
    expect(missing).toEqual([]);
  });

  test('le balayage trouve bien les feuilles (un balayage vide resterait vert)', () => {
    const total = files.reduce((count, file) => count + [...readFileSync(file, 'utf8').matchAll(/<Sheet\s+[a-zA-Z]/g)].length, 0);
    expect(total).toBeGreaterThanOrEqual(10);
  });
});
