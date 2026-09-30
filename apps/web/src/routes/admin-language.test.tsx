import { afterEach, describe, expect, test } from 'bun:test';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { OBJECT_ID, servedShareLinkFiche } from '@/lib/admin/share-link-fixtures';
import { adminShareLinkKey, decodeAdminShareLink } from '@/lib/api/admin-share-links';
import { appQueryClient } from '@/lib/api/query-client';
import { currentAdminLanguage } from '@/lib/i18n-admin-catalog';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt } from '@/test-support/admin-router';

import { AdminScreenFrame } from './admin-shell';

/**
 * **L'ADMINISTRATION PARLE QUATRE LANGUES — ET LES AUTRES LA LISENT EN ANGLAIS**
 * (directive porteur 2026-09-30, `decisions.md` D-159).
 *
 * Ces témoins montent le VRAI routeur, sur une VRAIE fiche, avec une langue
 * d'interface posée sur le document comme le fait `setInterfaceLanguage` : c'est
 * ce qui prouve le branchement complet — le chargeur de route qui charge le
 * catalogue de la langue d'ADMINISTRATION (pas celui de l'interface), l'écran
 * qui lit cette langue, la racine qui la déclare. Un témoin de composant, qui
 * reçoit `language="en"` en paramètre, ne prouverait rien de tout cela.
 *
 * Les attendus sont écrits à la main, dans chaque langue : un attendu relu dans
 * le catalogue serait vert sur un catalogue faux.
 *
 * - `de` et `ar` : textes anglais, dates anglaises (« Sep 20, 2026 », jamais
 *   « 20.09.2026 »), `lang="en" dir="ltr"` sur la racine — et le document,
 *   lui, reste dans SA langue et SON sens (un menu flottant ou une rangée de
 *   Réglages hors de l'administration ne bougent pas).
 * - `pt` : textes et dates portugais, `lang="pt"`.
 */
const { mounter, mount } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const LINK_ID = OBJECT_ID(1);

afterEach(() => {
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});

const speak = (language: string, direction: 'ltr' | 'rtl' = 'ltr'): void => {
  document.documentElement.lang = language;
  document.documentElement.dir = direction;
};

async function openShareLink(language: string, direction: 'ltr' | 'rtl' = 'ltr'): Promise<HTMLDivElement> {
  speak(language, direction);
  appQueryClient.setQueryData(adminShareLinkKey(LINK_ID), decodeAdminShareLink(servedShareLinkFiche()));
  return mountAdminAt(mounter, `/adm/share-links/${LINK_ID}`, BIGBOSS, '[data-admin-share-link-fiche]');
}

const shellOf = (host: ParentNode): HTMLElement => {
  const shell = host.querySelector<HTMLElement>('[data-admin-shell]');
  if (shell === null) throw new Error('la racine de l’administration est absente');
  return shell;
};

describe('une interface allemande ou arabe lit l’administration en anglais', () => {
  for (const [language, direction] of [
    ['de', 'ltr'],
    ['ar', 'rtl'],
  ] as const) {
    describe(`interface « ${language} »`, () => {
      test('les textes sont anglais — ceux de l’administration comme ceux du catalogue commun', async () => {
        const host = await openShareLink(language, direction);

        expect(host.querySelector('[data-admin-sidebar]')?.textContent).toContain('Administration');
        expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Share links');
        expect(host.querySelector('[data-admin-back]')?.getAttribute('aria-label')).toBe('Back to conversations');
        expect(host.querySelector('[data-admin-identity]')?.textContent).toContain('Active');
      });

      test('la date est formatée à l’anglaise', async () => {
        const host = await openShareLink(language, direction);

        expect(host.textContent).toContain('Sep 20, 2026');
        expect(host.textContent).not.toMatch(/\d{2}\.\d{2}\.\d{4}/);
      });

      test('la racine porte lang="en" dir="ltr", le document garde sa langue et son sens', async () => {
        const host = await openShareLink(language, direction);
        const shell = shellOf(host);

        expect(shell.getAttribute('lang')).toBe('en');
        expect(shell.getAttribute('dir')).toBe('ltr');
        expect(document.documentElement.lang).toBe(language);
        expect(document.documentElement.dir).toBe(direction);
      });

      test('la langue lue est l’anglais — la règle unique, pas une recopie', () => {
        speak(language, direction);
        expect(currentAdminLanguage()).toBe('en');
      });
    });
  }
});

describe('une interface portugaise lit l’administration en portugais', () => {
  test('textes, date et langue de la racine', async () => {
    const host = await openShareLink('pt');

    expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Links de compartilhamento');
    expect(host.querySelector('[data-admin-back]')?.getAttribute('aria-label')).toBe('Voltar às conversas');
    expect(host.textContent).toContain('20 de set. de 2026');
    expect(shellOf(host).getAttribute('lang')).toBe('pt');
    expect(shellOf(host).getAttribute('dir')).toBe('ltr');
  });
});

describe('une interface espagnole ou française garde sa langue', () => {
  test('es', async () => {
    const host = await openShareLink('es');

    expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Enlaces para compartir');
    expect(shellOf(host).getAttribute('lang')).toBe('es');
  });

  test('fr', async () => {
    const host = await openShareLink('fr');

    expect(host.querySelector('[data-admin-back-label]')?.textContent).toBe('Liens de partage');
    expect(host.textContent).toContain('20 sept. 2026');
    expect(shellOf(host).getAttribute('lang')).toBe('fr');
  });
});

describe('la racine déclare la langue dans TOUS ses états', () => {
  test('refusé : le refus se lit en anglais, sous lang="en" dir="ltr"', async () => {
    speak('de');
    const host = await mountAdminAt(mounter, `/adm/share-links/${LINK_ID}`, adminIdentityFixture({ role: 'USER' }), '[data-admin-shell]');

    expect(host.textContent).toContain('Restricted area');
    expect(host.textContent).toContain('Back to conversations');
    expect(shellOf(host).getAttribute('lang')).toBe('en');
    expect(shellOf(host).getAttribute('dir')).toBe('ltr');
  });

  test('en attente de l’identité : la racine est déjà posée', async () => {
    speak('ar', 'rtl');
    const host = await mount(
      <AdminScreenFrame language={currentAdminLanguage()} title="Administration" back="list">
        <p>contenu</p>
      </AdminScreenFrame>,
    );

    expect(shellOf(host).getAttribute('lang')).toBe('en');
    expect(shellOf(host).getAttribute('dir')).toBe('ltr');
  });

  test('une feuille ouverte dans l’administration est DANS la racine : elle hérite de sa langue et de son sens', async () => {
    speak('de');
    const host = await mount(
      <AdminScreenFrame language={currentAdminLanguage()} title="Administration" back="list">
        <AdminConfirmSheet
          language={currentAdminLanguage()}
          title="Close the link"
          body="Guests can no longer join."
          confirmLabel="Close"
          tone="danger"
          busy={false}
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />
      </AdminScreenFrame>,
      BIGBOSS,
    );

    const dialog = host.querySelector('dialog');
    expect(dialog).not.toBeNull();
    const root = dialog?.closest('[data-admin-shell]') ?? null;
    expect(root?.getAttribute('lang')).toBe('en');
    expect(root?.getAttribute('dir')).toBe('ltr');
  });
});
