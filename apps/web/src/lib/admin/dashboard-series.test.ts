import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { engagementView, hourlyView, languagesView, rankedConversationsView, rankedMembersView, typesView, volumeView } from './dashboard-series';

/**
 * **LES SÉRIES DU TABLEAU DE BORD, EN MOTS** (#8876, § 4) — ce qu'un graphique
 * peint et la phrase qu'un lecteur d'écran en lit. Les libellés servis (jours
 * en français, noms de tranche, couleurs) n'y entrent JAMAIS : ils sont lus par
 * position, par indice ou par code, puis redits dans la langue d'interface.
 */

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const NOW = new Date('2026-09-30T12:00:00.000Z');
const ID = '64f1c2a9e8b7d6c5b4a39281';

const flat = (text: string): string => text.replace(/[  ]/g, ' ');

describe('volumeView — messages par jour, libellés de jours PAR POSITION', () => {
  const days = [10, 20, 5, 40, 30, 0, 12];

  test('sept points, le dernier est aujourd’hui, dans la langue d’interface', () => {
    const fr = volumeView(days, NOW, 'fr').points;
    expect(fr.map((point) => point.value)).toEqual(days);
    expect(flat(fr[6]?.x ?? '')).toBe('mer. 30 sept.');
    expect(flat(fr[0]?.x ?? '')).toBe('jeu. 24 sept.');

    const en = volumeView(days, NOW, 'en').points;
    expect(en[6]?.x).toBe('Wed, Sep 30');
  });

  test('la synthèse nomme le pic, avec son jour', () => {
    expect(flat(volumeView(days, NOW, 'fr').summary)).toBe('Pic le dim. 27 sept. : 40');
    expect(volumeView(days, NOW, 'en').summary).toBe('Peak on Sun, Sep 27: 40');
  });

  test('sans aucun message, la synthèse le dit — pas un « pic à zéro »', () => {
    expect(volumeView([0, 0, 0], NOW, 'fr').summary).toBe('Aucun message sur les 7 derniers jours.');
  });

  test('le nombre de jours servis gouverne le nombre de libellés', () => {
    expect(volumeView([1, 2, 3], NOW, 'fr').points).toHaveLength(3);
    expect(volumeView([], NOW, 'fr').points).toEqual([]);
  });
});

describe('hourlyView — tranches de trois heures, nommées par leur heure de début', () => {
  const buckets = [
    { startHour: 18, messages: 4 },
    { startHour: 21, messages: 9 },
    { startHour: 0, messages: 1 },
  ];

  test('une barre par tranche, dans l’ordre chronologique servi, libellée par l’heure dans la langue d’interface', () => {
    const view = hourlyView(buckets, 'fr');
    expect(view.data.map((datum) => datum.value)).toEqual([4, 9, 1]);
    expect(view.data.map((datum) => flat(datum.label))).toEqual(['18 h', '21 h', '00 h']);
    expect(new Set(view.data.map((datum) => datum.key)).size).toBe(3);
  });

  test('la synthèse borne la tranche la plus active, y compris à cheval sur minuit', () => {
    expect(flat(hourlyView(buckets, 'fr').summary)).toBe('Tranche la plus active : de 21 h à 00 h (9)');
  });

  test('sans message, pas de synthèse', () => {
    expect(hourlyView([{ startHour: 3, messages: 0 }], 'fr').summary).toBe('');
    expect(hourlyView([], 'fr')).toEqual({ data: [], summary: '' });
  });
});

describe('engagementView — quatre tranches NOMMÉES par indice', () => {
  test('les noms viennent de l’indice, pas du serveur', () => {
    const view = engagementView([12, 30, 8, 50], 'fr');
    expect(view.data.map((datum) => datum.label)).toEqual(['Très actifs', 'Actifs', 'Occasionnels', 'Inactifs']);
    expect(view.data.map((datum) => datum.value)).toEqual([12, 30, 8, 50]);
    expect(engagementView([12, 30, 8, 50], 'en').data.map((datum) => datum.label)).toEqual(['Very active', 'Active', 'Occasional', 'Inactive']);
  });

  test('la synthèse donne la part de comptes actifs sur 7 jours (très actifs + actifs)', () => {
    expect(flat(engagementView([12, 30, 8, 50], 'fr').summary)).toBe('42 % des comptes ont été actifs ces 7 derniers jours.');
  });

  test('sans aucun compte, pas de synthèse', () => {
    expect(engagementView([0, 0, 0, 0], 'fr').summary).toBe('');
  });
});

describe('languagesView — des langues NOMMÉES, jamais un code', () => {
  test('« fr » se dit « Français » pour un lecteur français, « French » pour un anglophone', () => {
    const shares = [
      { code: 'fr', count: 900 },
      { code: 'en', count: 400 },
    ];
    expect(languagesView(shares, 'fr').data.map((datum) => datum.label)).toEqual(['Français', 'Anglais']);
    expect(languagesView(shares, 'en').data.map((datum) => datum.label)).toEqual(['French', 'English']);
  });

  test('un code que personne ne connaît se dit « Langue inconnue », jamais « Unknown »', () => {
    expect(languagesView([{ code: 'Unknown', count: 3 }], 'fr').data[0]?.label).toBe('Langue inconnue');
  });

  test('la synthèse nomme la langue en tête', () => {
    const view = languagesView(
      [
        { code: 'es', count: 10 },
        { code: 'de', count: 500 },
      ],
      'fr',
    );
    expect(flat(view.summary)).toBe('Langue la plus utilisée : Allemand (500)');
  });

  test('sans langue, pas de synthèse', () => {
    expect(languagesView([], 'fr')).toEqual({ data: [], summary: '' });
  });
});

describe('typesView — les types NOMMÉS, du plus envoyé au moins envoyé', () => {
  const shares = [
    { type: 'image', count: 30 },
    { type: 'text', count: 900 },
    { type: 'audio', count: 70 },
  ];

  test('l’ordre est celui des effectifs ; « text » se dit « Texte »', () => {
    const view = typesView(shares, 'fr');
    expect(view.data.map((datum) => datum.label)).toEqual(['Texte', 'Message vocal', 'Image']);
    expect(view.data.map((datum) => datum.value)).toEqual([900, 70, 30]);
  });

  test('la synthèse donne le type en tête et sa part', () => {
    expect(flat(typesView(shares, 'fr').summary)).toBe('Type le plus envoyé : Texte (90 %)');
  });

  test('un type inconnu se dit « Non reconnu », jamais son code', () => {
    expect(typesView([{ type: 'hologram', count: 1 }], 'fr').data[0]?.label).toBe('Non reconnu');
  });

  test('sans message, pas de synthèse', () => {
    expect(typesView([{ type: 'text', count: 0 }], 'fr').summary).toBe('');
  });
});

describe('les classements — des noms, des liens vers les fiches, JAMAIS d’identifiant en libellé', () => {
  test('conversations : le titre, ou le type quand la passerelle n’en sert pas', () => {
    const view = rankedConversationsView(
      [
        { id: ID, title: 'Famille', type: 'group', count: 120 },
        { id: '64f1c2a9e8b7d6c5b4a39282', title: null, type: 'direct', count: 80 },
        { id: '64f1c2a9e8b7d6c5b4a39283', title: null, type: null, count: 5 },
      ],
      'fr',
    );
    expect(view.data.map((datum) => datum.label)).toEqual(['Famille', 'Conversation privée', 'Conversation sans titre']);
    expect(view.data[0]?.target).toEqual({ kind: 'entity', entity: 'conversation', id: ID });
    expect(view.summary).toBe('Famille est en tête : 120');
  });

  test('membres : le nom affiché, sinon le prénom et le nom, sinon @pseudo', () => {
    const view = rankedMembersView(
      [
        { id: ID, displayName: 'Awa Diop', username: 'awa', firstName: null, lastName: null, count: 88 },
        { id: '64f1c2a9e8b7d6c5b4a39282', displayName: null, username: 'jean', firstName: null, lastName: null, count: 50 },
        { id: '64f1c2a9e8b7d6c5b4a39283', displayName: null, username: null, firstName: null, lastName: null, count: 2 },
      ],
      'fr',
    );
    expect(view.data.map((datum) => datum.label)).toEqual(['Awa Diop', '@jean', 'Compte sans nom']);
    expect(view.data[0]?.target).toEqual({ kind: 'entity', entity: 'user', id: ID });
    expect(view.summary).toBe('Awa Diop est en tête : 88');
  });

  test('un classement vide n’a ni données ni phrase', () => {
    expect(rankedMembersView([], 'fr')).toEqual({ data: [], summary: '' });
    expect(rankedConversationsView([], 'fr')).toEqual({ data: [], summary: '' });
  });
});
