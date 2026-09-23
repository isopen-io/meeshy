import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MaskedAttachment } from './masked-attachment';
import { Badges, FailedSendBand } from './message-blocks';
import { ProtectionNotice, ViewOnceChip } from './protected-content';

/**
 * LES LIBELLÉS D'ÉTAT DU FIL SUIVENT LA LANGUE DU LECTEUR (#7337).
 *
 * Le transfert, l'échec d'envoi, les tombstones et les voiles de pièce
 * protégée étaient EN DUR, en français. Tous les témoins qui les lisaient
 * tournaient en français (le préchargement pose `fr`), et un gate Playwright
 * tourne en `en-US` : aucun des deux ne pouvait distinguer « le libellé vient
 * du catalogue » de « le libellé est écrit en dur ». Ce fichier fait varier la
 * SEULE dimension qui change — la langue du document — et asserte le texte
 * servi dans DEUX autres langues, dont une à droite-à-gauche.
 *
 * Chaque cas asserte aussi l'ABSENCE du français : une recopie du libellé
 * français dans le catalogue anglais passerait un témoin « non vide ».
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await Promise.all([loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const renderIn = (language: InterfaceLanguage, node: Parameters<typeof renderToStaticMarkup>[0]): string => {
  document.documentElement.lang = language;
  return renderToStaticMarkup(node);
};

const piece = (mimeType: string): Attachment => ({
  id: `a-${mimeType}`,
  messageId: 'm-1',
  fileName: 'piece',
  originalName: 'piece',
  mimeType,
  fileSize: 128,
  fileUrl: 'https://cdn.test/piece',
  uploadedBy: 'u-alice',
  isAnonymous: false,
  createdAt: '2026-06-02T10:00:00.000Z',
  capturedInApp: false,
  isForwarded: false,
  isViewOnce: true,
  viewOnceCount: 0,
  isBlurred: false,
  isEncrypted: false,
  viewedCount: 0,
  downloadedCount: 0,
  consumedCount: 0,
});

describe('le badge de transfert', () => {
  test('en : « Forwarded from Salon » — le NOM reste la donnée, le libellé change', () => {
    const html = renderIn('en', <Badges badges={[{ kind: 'forwarded', attribution: { kind: 'group', name: 'Salon' } }]} />);
    expect(html).toContain('Forwarded from Salon');
    expect(html).not.toContain('Transféré');
  });

  test('ar : le transfert sans nom est arabe', () => {
    const html = renderIn('ar', <Badges badges={[{ kind: 'forwarded', attribution: { kind: 'anonymous' } }]} />);
    expect(html).toContain('تمت إعادة التوجيه');
    expect(html).not.toContain('Transféré');
  });
});

describe('la bande d’échec d’envoi', () => {
  test('en : « Not sent » et « Try again »', () => {
    const html = renderIn('en', <FailedSendBand onRetry={() => undefined} textColor="red" />);
    expect(html).toContain('Not sent');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Non envoyé');
    expect(html).not.toContain('Réessayer');
  });

  test('en : la RAISON est la donnée, posée à sa place dans la phrase de la langue', () => {
    const html = renderIn('en', <FailedSendBand reason="quota" textColor="red" />);
    expect(html).toContain('Not sent — quota');
    expect(html).not.toContain('Non envoyé');
  });
});

describe('les tombstones', () => {
  for (const surface of ['row', 'bubble'] as const) {
    test(`[${surface}] en : supprimé, texte ET nom accessible`, () => {
      const deleted = renderIn('en', <ProtectionNotice kind="deleted" surface={surface} />);
      expect(deleted).toContain('>Message deleted<');
      expect(deleted).toContain('aria-label="Message deleted"');
      expect(deleted).not.toContain('supprimé');
    });
  }

  test('en : la puce de la vue unique se dit dans la langue du lecteur, sans un mot de suppression (#7580)', () => {
    const sealed = renderIn('en', <ViewOnceChip state="sealed" />);
    expect(sealed).toContain('Tap to view');
    expect(sealed).toContain('aria-label="View-once message, tap to view"');
    const opened = renderIn('en', <ViewOnceChip state="opened" />);
    expect(opened).toContain('Already opened');
    expect(opened).toContain('aria-label="View-once message, already opened"');
    expect(opened).not.toMatch(/deleted|supprimé/);
  });

  test('ar : le message supprimé est arabe', () => {
    const html = renderIn('ar', <ProtectionNotice kind="deleted" surface="row" />);
    expect(html).toContain('تم حذف الرسالة');
    expect(html).not.toContain('Message supprimé');
  });
});

describe('les voiles de pièce protégée', () => {
  const cases = [
    ['image/png', 'Protected photo'],
    ['audio/mpeg', 'Protected voice message'],
    ['application/pdf', 'Protected attachment'],
  ] as const;
  for (const [mimeType, expected] of cases) {
    test(`en : ${mimeType} ⇒ « ${expected} », peint ET annoncé`, () => {
      const html = renderIn('en', <MaskedAttachment attachment={piece(mimeType)} />);
      expect(html).toContain(`aria-label="${expected}"`);
      expect(html).toContain(`>${expected}<`);
      expect(html).not.toContain('protégé');
    });
  }
});
