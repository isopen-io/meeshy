import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DayPill, ScrollToBottomButton } from './thread-chrome';

describe('DayPill (#5774, travail 3/3, T9)', () => {
  test('label present, en-tete replie -> un role=heading aria-level=2 au texte, aria-hidden absent, pointer-events none', () => {
    const html = renderToStaticMarkup(<DayPill label="Hier" headerExpanded={false} />);
    expect(html).toContain('role="heading"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('>Hier<');
    expect(html).not.toContain('aria-hidden');
    expect(html).toContain('pointer-events-none');
  });

  test('en-tete DEPLIE -> rien ne se monte, quel que soit le libelle', () => {
    const html = renderToStaticMarkup(<DayPill label="Hier" headerExpanded />);
    expect(html).toBe('');
  });

  test('aucun libelle -> rien ne se monte', () => {
    const html = renderToStaticMarkup(<DayPill label={null} headerExpanded={false} />);
    expect(html).toBe('');
  });
});

describe('ScrollToBottomButton (#5774, travail 3/3)', () => {
  test('invisible -> ne se monte pas', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible={false} unreadCount={0} onClick={() => {}} />,
    );
    expect(html).toBe('');
  });

  test('visible, sans non-lus -> cible 44pt, libelle "Defiler vers le bas", chevron seul', () => {
    const html = renderToStaticMarkup(<ScrollToBottomButton visible unreadCount={0} onClick={() => {}} />);
    expect(html).toContain('aria-label="Défiler vers le bas"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('min-w-11');
  });

  test('visible, 3 non-lus en DM -> libelle pluriel, apercu SANS nom', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible unreadCount={3} previewText="Salut" onClick={() => {}} />,
    );
    expect(html).toContain('aria-label="3 messages non lus, Défiler vers le bas"');
    expect(html).toContain('>Salut<');
    expect(html).not.toContain('messages non lus<');
  });

  test('visible, 6 non-lus en GROUPE -> en-tete "N messages non lus" ET apercu prefixe par le nom', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible unreadCount={6} senderName="Bruno" previewText="Salut" onClick={() => {}} />,
    );
    expect(html).toContain('6 messages non lus<');
    expect(html).toContain('>Bruno : Salut<');
  });

  test('5 non-lus (borne) -> pas d en-tete "N messages", seulement l apercu', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible unreadCount={5} senderName="Bruno" previewText="Salut" onClick={() => {}} />,
    );
    expect(html).not.toContain('messages non lus<');
    expect(html).toContain('>Bruno : Salut<');
  });
});
