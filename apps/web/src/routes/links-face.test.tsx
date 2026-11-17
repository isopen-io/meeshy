import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { MyAddress } from '@/lib/api/my-addresses';

import { LinkFamilyCard } from './link-families-parts';
import { LinksAddresses } from './links-addresses';
import { LinksProfileTicket } from './links-profile-ticket';

const noop = () => undefined;
const address = (overrides: Partial<MyAddress> = {}): MyAddress => ({ id: 'a1', title: 'Site', url: 'https://aissandiaye.studio', glyph: 'site', position: 0, isShown: true, clicks: 0, ...overrides });

describe('le billet du lien de profil', () => {
  const html = renderToStaticMarkup(<LinksProfileTicket language="fr" username="aissa" onCopy={noop} onOpenCode={noop} onSend={noop} />);

  test('il dit mon adresse canonique et porte son QR', () => {
    expect(html).toContain('meeshy.me/u/aissa');
    expect(html).toContain('data-kit-code-plate');
    expect(html).toMatch(/aria-label="[^"]*QR[^"]*"/);
  });

  test('copier, QR et envoyer sont des actions nommées', () => {
    expect(html).toContain('Copier');
    expect(html).toContain('Envoyer');
    expect(html).toMatch(/data-links-profile-action="code"/);
  });

  test('sans geste d’envoi (hors connexion), « Envoyer » n’est pas dessiné', () => {
    const bare = renderToStaticMarkup(<LinksProfileTicket language="fr" username="aissa" onCopy={noop} onOpenCode={noop} onSend={undefined} />);
    expect(bare).not.toContain('data-links-profile-action="send"');
  });
});

describe('mes adresses', () => {
  test('la section n’apparaît pas quand le serveur n’en sert aucune', () => {
    expect(renderToStaticMarkup(<LinksAddresses language="fr" addresses={null} />)).toBe('');
    expect(renderToStaticMarkup(<LinksAddresses language="fr" addresses={[]} />)).toBe('');
  });

  test('chaque adresse est un billet qui ouvre son site hors de l’application', () => {
    const html = renderToStaticMarkup(<LinksAddresses language="fr" addresses={[address(), address({ id: 'a2', title: 'Musique', url: 'https://soundcloud.com/aissa', glyph: 'music' })]} />);
    expect(html).toContain('Musique');
    expect(html).toContain('soundcloud.com/aissa');
    expect(html).toMatch(/<a[^>]*href="https:\/\/soundcloud.com\/aissa"[^>]*rel="noopener noreferrer"/);
  });

  test('une adresse masquée sur la fiche reste dans la liste de son propriétaire', () => {
    const html = renderToStaticMarkup(<LinksAddresses language="fr" addresses={[address({ isShown: false })]} />);
    expect(html).toContain('Site');
  });
});

describe('les familles du hub', () => {
  test('une famille dit son chiffre quand il est connu, et rien quand il ne l’est pas', () => {
    const withFigure = renderToStaticMarkup(<LinkFamilyCard language="fr" family="tracking" figure={{ value: '1 284', caption: 'clics' }} />);
    expect(withFigure).toContain('data-links-family-figure');
    expect(withFigure).toContain('1 284');
    expect(renderToStaticMarkup(<LinkFamilyCard language="fr" family="tracking" />)).not.toContain('data-links-family-figure');
  });
});
