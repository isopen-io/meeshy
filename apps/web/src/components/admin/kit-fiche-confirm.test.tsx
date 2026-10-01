import { act, type ComponentProps } from 'react';
import { describe, expect, test } from 'bun:test';

import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminBadge } from './badges';
import { AdminConfirmSheet } from './confirm-sheet';
import { AdminFiche, AdminFicheSection, AdminIdentityHeader, AdminStatStrip } from './fiche';

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

describe('AdminFiche — la mise en page d’une fiche', () => {
  test('porte le genre ; colonne principale + colonne latérale dès 56 rem de CONTENU', async () => {
    const host = await mount(
      <AdminFiche kind="user" header={<p data-h>h</p>} stats={<p data-s>s</p>} aside={<p data-a>a</p>}>
        <p data-c>c</p>
      </AdminFiche>,
    );
    expect(host.querySelector('[data-admin-fiche="user"]')).not.toBeNull();
    const layout = host.querySelector('[data-admin-fiche] > div:last-child')?.className ?? '';
    expect(layout).toContain('@4xl:grid-cols-[minmax(0,1fr)_20rem]');
    expect(layout).not.toContain('lg:grid-cols');
    /* La colonne principale est elle-même un conteneur : une liste dans une carte choisit d'après SA largeur. */
    expect(host.querySelector('[data-admin-fiche] > div:last-child > div')?.className).toContain('@container');
    expect(host.querySelector('aside [data-a]')).not.toBeNull();
    expect(host.querySelector('[data-h]')).not.toBeNull();
    expect(host.querySelector('[data-s]')).not.toBeNull();
  });

  test('sans colonne latérale, le contenu prend toute la largeur', async () => {
    const host = await mount(
      <AdminFiche kind="report" header={null}>
        <p data-c>c</p>
      </AdminFiche>,
    );
    expect(host.querySelector('aside')).toBeNull();
    expect(host.querySelector('[data-admin-fiche] > div:last-child')?.className).not.toContain('lg:grid-cols');
  });
});

describe('AdminIdentityHeader — le VRAI nom', () => {
  test('nom en h2, secondaire, badges et gestes', async () => {
    const host = await mount(
      <AdminIdentityHeader
        language="fr"
        title="Awa Diop"
        secondary="@awa"
        avatar={{ initials: 'AD', color: 'var(--color-ios-brand)' }}
        badges={<AdminBadge tone="success">Actif</AdminBadge>}
        actions={<button type="button">Éditer</button>}
      />,
    );
    expect(host.querySelector('h2')?.textContent).toBe('Awa Diop');
    expect(host.querySelector('[data-admin-identity]')?.textContent).toContain('@awa');
    expect(host.querySelector('[data-admin-badge], span')?.textContent).toBeDefined();
    expect(host.querySelector('button')?.textContent).toBe('Éditer');
    expectNoRawIdentifiers(host);
  });

  test('sans avatar, le glyphe du genre tient lieu de visuel', async () => {
    const host = await mount(<AdminIdentityHeader language="fr" title="Signalement · Harcèlement" glyph="flag" />);
    expect(host.querySelector('[data-admin-identity] svg')).not.toBeNull();
  });
});

describe('AdminStatStrip', () => {
  test('une liste de définitions : libellé, valeur ; un lien de 44 px quand la liste filtrée existe', async () => {
    const host = await mount(
      <AdminStatStrip
        items={[
          { id: 'messages', label: 'Messages envoyés', value: '1 204' },
          { id: 'reports', label: 'Signalements reçus', value: '3', target: { kind: 'section', section: 'users' } },
        ]}
      />,
      BIGBOSS,
    );
    expect(host.querySelectorAll('dl')).toHaveLength(1);
    expect([...host.querySelectorAll('[data-admin-stat]')].map((item) => item.getAttribute('data-admin-stat'))).toEqual(['messages', 'reports']);
    expect(host.querySelector('[data-admin-stat="messages"] a')).toBeNull();
    expect(host.querySelector('[data-admin-stat="reports"] a')?.getAttribute('href')).toBe('/admin/users');
    expect(host.querySelector('[data-admin-stat="messages"] dt')?.textContent).toBe('Messages envoyés');
  });

  test('le balisage est VALIDE : chaque dt et chaque dd est l’enfant direct d’un div, lui-même enfant de la dl', async () => {
    const host = await mount(
      <AdminStatStrip
        items={[
          { id: 'messages', label: 'Messages envoyés', value: '1 204' },
          { id: 'reports', label: 'Signalements reçus', value: '3', target: { kind: 'section', section: 'users' } },
        ]}
      />,
      BIGBOSS,
    );
    const dl = host.querySelector('dl');
    const terms = [...host.querySelectorAll('dt, dd')];

    expect(terms).toHaveLength(4);
    for (const term of terms) {
      expect(term.parentElement?.tagName).toBe('DIV');
      expect(term.parentElement?.parentElement).toBe(dl);
    }
    /* Ni lien ni autre enveloppe entre le `div` et ses `dt`/`dd`. */
    expect([...(dl?.children ?? [])].every((child) => child.tagName === 'DIV')).toBe(true);
  });

  test('un chiffre lié : la VALEUR est le lien, étiré sur toute la carte (cible de 44 px) ; sans lien, du texte', async () => {
    const host = await mount(
      <AdminStatStrip
        items={[
          { id: 'messages', label: 'Messages envoyés', value: '1 204' },
          { id: 'reports', label: 'Signalements reçus', value: '3', target: { kind: 'section', section: 'users' } },
        ]}
      />,
      BIGBOSS,
    );
    const linked = host.querySelector('[data-admin-stat="reports"]');

    expect(linked?.querySelector('dd a')?.textContent).toBe('3');
    expect(linked?.className).toContain('relative');
    expect(linked?.querySelector('dd a')?.className).toContain('after:absolute');
    expect(linked?.querySelector('dd a')?.className).toContain('after:inset-0');
    expect(linked?.getAttribute('style')).toContain('min-height: 44px');
    expect(host.querySelector('[data-admin-stat="messages"] dd')?.textContent).toBe('1 204');
  });

  test('une cible que le lecteur ne peut pas ouvrir devient du texte — jamais un lien vers un refus', async () => {
    const host = await mount(
      <AdminStatStrip items={[{ id: 'reports', label: 'Signalements reçus', value: '3', target: { kind: 'section', section: 'users' } }]} />,
      adminIdentityFixture({ role: 'USER' }),
    );

    expect(host.querySelector('[data-admin-stat="reports"] a')).toBeNull();
    expect(host.querySelector('[data-admin-stat="reports"] dd')?.textContent).toBe('3');
  });
});

describe('AdminFicheSection', () => {
  test('une section nommée par son titre (aria-labelledby), ses gestes à côté du titre', async () => {
    const host = await mount(
      <AdminFicheSection id="activity" title="Activité" actions={<button type="button">Tout voir</button>}>
        <p>contenu</p>
      </AdminFicheSection>,
    );
    const section = host.querySelector('section');
    expect(section?.getAttribute('aria-labelledby')).toBe('activity-title');
    expect(host.querySelector('#activity-title')?.textContent).toBe('Activité');
    expect(section?.querySelector('button')?.textContent).toBe('Tout voir');
    expect(section?.getAttribute('data-admin-fiche-section')).toBe('activity');
  });
});

describe('AdminConfirmSheet — tout geste sensible passe par ici', () => {
  type Reponses = { confirmations: (string | null)[]; annulations: number };

  async function ouvrir(props: Partial<ComponentProps<typeof AdminConfirmSheet>> = {}) {
    const reponses: Reponses = { confirmations: [], annulations: 0 };
    const host = await mount(
      <AdminConfirmSheet
        language="fr"
        title="Fermer le lien"
        body="Les invités arrivés par ce lien perdent l’accès."
        confirmLabel="Fermer le lien"
        tone="danger"
        busy={false}
        onConfirm={(motif) => reponses.confirmations.push(motif)}
        onCancel={() => (reponses.annulations += 1)}
        {...props}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    return { host, reponses };
  }

  const confirmer = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]');
  const annuler = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-action="cancel"]');
  const motif = (host: ParentNode) => host.querySelector<HTMLTextAreaElement>('[data-admin-motive]');

  test('une feuille modale : titre, corps qui dit l’effet, le verbe exact sur le bouton', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('dialog')?.getAttribute('data-sheet-presentation')).toBe('centered');
    expect(host.querySelector('dialog h2')?.textContent).toBe('Fermer le lien');
    expect(host.querySelector('[data-admin-confirm]')?.textContent).toContain('perdent l’accès');
    expect(confirmer(host)?.textContent).toBe('Fermer le lien');
    expect(confirmer(host)?.style.minHeight).toBe('44px');
  });

  test('sans motif demandé : le focus va sur « Annuler » — « Entrée » ne confirme jamais par inadvertance', async () => {
    const { host } = await ouvrir();
    expect(document.activeElement).toBe(annuler(host));
    expect(motif(host)).toBeNull();
  });

  test('confirmer rend `null` quand aucun motif n’est demandé', async () => {
    const { host, reponses } = await ouvrir();
    await act(async () => confirmer(host)?.click());
    expect(reponses.confirmations).toEqual([null]);
  });

  test('avec un motif : le focus va sur le champ, et la confirmation reste bloquée sous le minimum', async () => {
    const { host, reponses } = await ouvrir({ motive: { label: 'Motif (obligatoire)', minLength: 10, required: true } });
    expect(document.activeElement).toBe(motif(host));
    expect(confirmer(host)?.disabled).toBe(true);
    expect(host.querySelector('[data-admin-motive-count]')?.textContent).toBe('0 sur 10 caractères minimum');

    mounter.type(host, '[data-admin-motive]', 'court');
    expect(host.querySelector('[data-admin-motive-count]')?.textContent).toBe('5 sur 10 caractères minimum');
    expect(confirmer(host)?.disabled).toBe(true);
    expect(reponses.confirmations).toEqual([]);
  });

  test('un motif suffisant débloque la confirmation, et part NETTOYÉ de ses espaces de bord', async () => {
    const { host, reponses } = await ouvrir({ motive: { label: 'Motif', minLength: 10, required: true } });
    mounter.type(host, '[data-admin-motive]', '   lien partagé hors du cadre   ');
    expect(confirmer(host)?.disabled).toBe(false);
    await act(async () => confirmer(host)?.click());
    expect(reponses.confirmations).toEqual(['lien partagé hors du cadre']);
  });

  test('un motif FACULTATIF ne bloque que s’il est commencé et trop court', async () => {
    const { host } = await ouvrir({ motive: { label: 'Motif', minLength: 3, required: false } });
    expect(confirmer(host)?.disabled).toBe(false);
    mounter.type(host, '[data-admin-motive]', 'ab');
    expect(confirmer(host)?.disabled).toBe(true);
    mounter.type(host, '[data-admin-motive]', 'abc');
    expect(confirmer(host)?.disabled).toBe(false);
  });

  test('annuler appelle onCancel', async () => {
    const { host, reponses } = await ouvrir();
    await act(async () => annuler(host)?.click());
    expect(reponses.annulations).toBe(1);
  });

  test('en cours : les deux boutons sont désactivés et le verbe cède la place à « En cours… »', async () => {
    const { host } = await ouvrir({ busy: true });
    expect(confirmer(host)?.disabled).toBe(true);
    expect(annuler(host)?.disabled).toBe(true);
    expect(confirmer(host)?.textContent).toBe('En cours…');
    expect(confirmer(host)?.getAttribute('aria-busy')).toBe('true');
  });

  test('une erreur se dit en alerte sous le corps', async () => {
    const { host } = await ouvrir({ error: 'Le lien est déjà fermé.' });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Le lien est déjà fermé.');
  });

  test('le ton danger porte la couleur de danger, le ton primary celle de la marque — en jetons', async () => {
    const danger = await ouvrir();
    expect(confirmer(danger.host)?.style.backgroundColor).toBe('var(--color-danger)');
    mounter.unmountAll();
    const primaire = await ouvrir({ tone: 'primary' });
    expect(confirmer(primaire.host)?.style.backgroundColor).toBe('var(--color-ios-brand)');
  });
});
