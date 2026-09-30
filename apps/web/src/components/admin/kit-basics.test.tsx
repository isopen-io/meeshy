import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { interpretRole, interpretReportStatus } from '@/lib/admin/interpret/enums';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminGlyph } from './admin-glyph';
import { AdminBadge, AdminInterpretedBadge, AdminLanguageBadge, AdminRoleBadge } from './badges';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from './meta';
import { AdminPageHeader } from './page-header';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice, AdminOfflineNotice } from './states';

const { mount } = setupAdminKitTests({ languages: ['fr', 'en'] });

const ID = '64f1c2a9e8b7d6c5b4a39281';
const NOW = new Date('2026-09-30T14:03:00Z');

describe('AdminGlyph', () => {
  test('décoratif par défaut (aria-hidden), nommé quand on lui donne un titre', async () => {
    const host = await mount(
      <div>
        <AdminGlyph name="gear" />
        <AdminGlyph name="flag" title="Signalement" />
      </div>,
    );
    const [decoratif, nomme] = [...host.querySelectorAll('svg')];
    expect(decoratif?.getAttribute('aria-hidden')).toBe('true');
    expect(nomme?.getAttribute('role')).toBe('img');
    expect(nomme?.getAttribute('aria-label')).toBe('Signalement');
  });
});

describe('les badges — le mot d’abord, jamais la couleur seule', () => {
  test('AdminBadge porte son mot et son glyphe, teinté par le ton en jetons', async () => {
    const host = await mount(
      <AdminBadge tone="danger" glyph="prohibit" anchor="etat">
        Banni
      </AdminBadge>,
    );
    const badge = host.querySelector('[data-admin-badge="etat"]');
    expect(badge?.textContent).toBe('Banni');
    expect(badge?.querySelector('svg')).not.toBeNull();
    const style = badge?.getAttribute('style') ?? '';
    expect(style).toContain('var(--color-danger)');
    expect(style).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  test('AdminInterpretedBadge : title = explication, data-admin-raw = code brut, jamais lu à l’œil', async () => {
    const host = await mount(<AdminInterpretedBadge value={interpretRole('BIGBOSS', 'fr')} />);
    const enveloppe = host.querySelector('[data-admin-raw]');
    expect(enveloppe?.getAttribute('data-admin-raw')).toBe('BIGBOSS');
    expect(enveloppe?.getAttribute('title')).toBe('Tous les droits, y compris les gestes souverains.');
    expect(enveloppe?.textContent).toBe('Créateur');
    expectNoRawIdentifiers(host);
  });

  test('un état sans explication ne pose pas de title', async () => {
    const host = await mount(<AdminInterpretedBadge value={interpretReportStatus('pending', 'fr')} />);
    expect(host.querySelector('[data-admin-raw]')?.hasAttribute('title')).toBe(false);
  });

  test('AdminRoleBadge dit le rôle en mots, dans la langue d’interface', async () => {
    const host = await mount(
      <div>
        <AdminRoleBadge language="fr" role="MODERATOR" />
        <AdminRoleBadge language="en" role="MODERATOR" />
      </div>,
    );
    expect(host.textContent).toBe('ModérateurModerator');
  });

  test('AdminLanguageBadge : le NOM de la langue, jamais « ES »', async () => {
    const host = await mount(
      <div>
        <AdminLanguageBadge language="fr" code="es" />
        <AdminLanguageBadge language="fr" code={null} />
      </div>,
    );
    expect(host.textContent).toBe('EspagnolAucune');
  });
});

describe('le panneau de métadonnées', () => {
  test('une liste de définitions titrée : libellé, valeur qui revient à la ligne, explication dessous', async () => {
    const host = await mount(
      <AdminMetaPanel title="Métadonnées">
        <AdminMetaRow label="Chiffrement" value="Chiffrée de bout en bout" explain="Le serveur ne lit pas les messages." anchor="encryption" />
        <AdminMetaRow label="Créée" value="il y a 3 minutes" />
      </AdminMetaPanel>,
    );
    expect(host.querySelector('h2')?.textContent).toBe('Métadonnées');
    expect(host.querySelectorAll('dl')).toHaveLength(1);
    const ligne = host.querySelector('[data-admin-meta="encryption"]');
    expect(ligne?.querySelector('dt')?.textContent).toBe('Chiffrement');
    expect(ligne?.querySelectorAll('dd')[1]?.textContent).toBe('Le serveur ne lit pas les messages.');
    expect(ligne?.querySelector('dd')?.className).toContain('break-words');
  });

  test('AdminMomentText : relatif, absolu en infobulle, ou les deux — « — » quand l’instant manque', async () => {
    const moment = adminMomentOf('2026-09-30T14:00:00Z', NOW, 'fr', { timeZone: 'UTC' });
    const host = await mount(
      <div>
        <p data-a>
          <AdminMomentText moment={moment} />
        </p>
        <p data-b>
          <AdminMomentText moment={moment} variant="both" />
        </p>
        <p data-c>
          <AdminMomentText moment={null} />
        </p>
      </div>,
    );
    expect(host.querySelector('[data-a] time')?.textContent).toBe('il y a 3 minutes');
    expect(host.querySelector('[data-a] time')?.getAttribute('title')).toBe('30 sept. 2026, 14:00');
    expect(host.querySelector('[data-a] time')?.getAttribute('datetime')).toBe('2026-09-30T14:00:00Z');
    expect(host.querySelector('[data-b] time')?.textContent).toBe('30 sept. 2026, 14:00 · il y a 3 minutes');
    expect(host.querySelector('[data-c]')?.textContent).toBe('—');
  });

  test('AdminTechnicalId : l’identifiant en police mono dans son ancre, copiable, la copie s’ANNONCE', async () => {
    const annonces: string[] = [];
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void copied.push(text) } });

    const host = await mount(<AdminTechnicalId language="fr" id={ID} onAnnounce={(message) => annonces.push(message)} />);
    expect(host.querySelector('[data-admin-technical-id]')?.textContent).toBe(ID);
    expect(host.querySelector('dt')?.textContent).toBe('Identifiant technique');
    expectNoRawIdentifiers(host);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-admin-action="copy-technical-id"]')?.click();
    });
    expect(copied).toEqual([ID]);
    expect(annonces).toEqual(['Identifiant copié']);
  });

  test('une copie impossible s’annonce aussi', async () => {
    const annonces: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => Promise.reject(new Error('refusé')) } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });

    const host = await mount(<AdminTechnicalId language="fr" id={ID} onAnnounce={(message) => annonces.push(message)} />);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-admin-action="copy-technical-id"]')?.click();
    });
    expect(annonces).toEqual(['Copie impossible']);
  });
});

describe('l’en-tête de page', () => {
  test('le SEUL h1, sa phrase d’aide, ses badges et ses gestes', async () => {
    const host = await mount(
      <AdminPageHeader
        language="fr"
        title="Awa Diop"
        subtitle="Membre depuis trois mois"
        badges={<AdminBadge tone="success">Actif</AdminBadge>}
        actions={<button type="button">Éditer</button>}
      />,
    );
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('h1')?.textContent).toBe('Awa Diop');
    expect(host.querySelector('[data-admin-page-title]')).not.toBeNull();
    expect(host.querySelector('p')?.textContent).toBe('Membre depuis trois mois');
    expect(host.querySelector('[data-admin-page-actions] button')?.textContent).toBe('Éditer');
  });

  test('le fil d’Ariane : navigation nommée, liste ordonnée, dernier élément = page courante, sans lien', async () => {
    const host = await mount(
      <AdminPageHeader
        language="fr"
        title="Awa Diop"
        crumbs={[{ label: 'Personnes' }, { label: 'Comptes', target: { kind: 'section', section: 'users' } }, { label: 'Awa Diop' }]}
      />,
      adminIdentityFixture({ role: 'BIGBOSS' }),
    );
    const nav = host.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Fil d’Ariane');
    const items = [...(nav?.querySelectorAll('li') ?? [])];
    expect(items.map((item) => item.textContent)).toEqual(['Personnes', 'Comptes', 'Awa Diop']);
    expect(items[1]?.querySelector('a')?.getAttribute('href')).toBe('/admin/users');
    expect(items[2]?.querySelector('[aria-current="page"]')).not.toBeNull();
    expect(items[2]?.querySelector('a')).toBeNull();
  });

  test('un maillon dont la section n’est pas ouverte au lecteur est un texte, pas un lien', async () => {
    const host = await mount(
      <AdminPageHeader language="fr" title="x" crumbs={[{ label: 'Comptes', target: { kind: 'section', section: 'users' } }, { label: 'Nom' }]} />,
      adminIdentityFixture({ role: 'MODERATOR' }),
    );
    expect(host.querySelector('nav a')).toBeNull();
  });
});

describe('les états', () => {
  test('vide : titre, indication, glyphe, geste', async () => {
    const host = await mount(<AdminEmptyState title="Aucun signalement" hint="Tout est traité." glyph="flag" action={<button type="button">Actualiser</button>} />);
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucun signalement');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Tout est traité.');
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('button')?.textContent).toBe('Actualiser');
  });

  test('erreur : alerte, message par défaut, « Réessayer » de 44 px qui rappelle', async () => {
    let appels = 0;
    const host = await mount(<AdminErrorState language="fr" onRetry={() => (appels += 1)} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger ces données pour le moment.');
    const bouton = host.querySelector<HTMLButtonElement>('[data-admin-retry]');
    expect(bouton?.textContent).toBe('Réessayer');
    expect(bouton?.style.minHeight).toBe('44px');
    await act(async () => bouton?.click());
    expect(appels).toBe(1);
  });

  test('erreur : un message propre remplace le message par défaut', async () => {
    const host = await mount(<AdminErrorState language="fr" message="Le journal est indisponible." onRetry={() => undefined} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Le journal est indisponible.');
  });

  test('bloc refusé en ligne : dit que le rôle n’y donne pas accès', async () => {
    const host = await mount(<AdminDeniedInline language="fr" />);
    expect(host.textContent).toContain('votre rôle n’y donne pas accès');
  });

  test('avis en ligne : alerte pour un danger, statut sinon — toujours avec son glyphe et son texte', async () => {
    const host = await mount(
      <div>
        <AdminInlineNotice tone="danger" text="Échec" />
        <AdminInlineNotice tone="warning" text="Attention" action={<button type="button">Voir</button>} />
      </div>,
    );
    const [danger, avertissement] = [...host.querySelectorAll('[data-admin-notice]')];
    expect(danger?.getAttribute('role')).toBe('alert');
    expect(avertissement?.getAttribute('role')).toBe('status');
    expect(danger?.querySelector('svg')).not.toBeNull();
    expect(avertissement?.querySelector('button')?.textContent).toBe('Voir');
  });

  test('hors ligne : l’avis n’apparaît que sans réseau', async () => {
    const enLigne = await mount(<AdminOfflineNotice language="fr" />);
    expect(enLigne.querySelector('[data-admin-notice]')).toBeNull();

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const horsLigne = await mount(<AdminOfflineNotice language="fr" />);
    expect(horsLigne.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});
