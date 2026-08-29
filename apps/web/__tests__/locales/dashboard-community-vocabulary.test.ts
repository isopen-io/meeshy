/**
 * Garde de VOCABULAIRE de la modale de création du tableau de bord (#4222).
 *
 * La décision de l'issue — ce que cette modale crée est une COMMUNAUTÉ, pas une
 * conversation de groupe — n'est pas une note dans un fichier : elle est
 * MESURABLE sur les quatre langues servies. Ce qui avait produit l'ambiguïté
 * était précisément qu'un même écran dise « groupe » à un endroit et
 * « communauté » à l'autre (dimension 6, cohérence de positionnement).
 *
 * Cette garde tient donc les DEUX moitiés :
 *   - aucune chaîne de cette modale ne parle de « groupe » ;
 *   - les cinq chaînes qui NOMMENT l'objet créé disent bien « communauté ».
 *
 * Elle est NÉGATIVE pour moitié, et une garde négative meurt en silence : le
 * garde-fou de harnais ci-dessous (quatre langues, un plancher de chaînes
 * inspectées) la fait rougir si les fichiers cessaient d'être lus.
 */

import fs from 'fs';
import path from 'path';

const LANGUES = ['en', 'fr', 'es', 'pt'] as const;
type Langue = (typeof LANGUES)[number];

/** Le mot INTERDIT et le mot ATTENDU, par langue. */
const MOTS: Record<Langue, { interdit: RegExp; attendu: string }> = {
  en: { interdit: /\bgroups?\b/i, attendu: 'community' },
  fr: { interdit: /\bgroupes?\b/i, attendu: 'communaut' },
  es: { interdit: /\bgrupos?\b/i, attendu: 'comunidad' },
  pt: { interdit: /\bgrupos?\b/i, attendu: 'comunidade' },
};

/**
 * Les cinq chaînes qui NOMMENT l'objet créé — celles qu'un utilisateur lit
 * pour savoir ce qu'il vient de fabriquer.
 */
const CHAÎNES_QUI_NOMMENT = [
  'createGroupModal.title',
  'createGroupModal.nameLabel',
  'createGroupModal.privateLabel',
  'createGroupModal.create',
  'success.groupCreated',
];

/** Tout ce que la modale et son bouton d'ouverture affichent. */
const SOUS_ARBRES_DE_LA_MODALE = ['createGroupModal', 'quickActions'];

const chargerDashboard = (langue: Langue): Record<string, unknown> => {
  const fichier = path.join(process.cwd(), 'locales', langue, 'dashboard.json');
  const racine = JSON.parse(fs.readFileSync(fichier, 'utf8')) as Record<string, unknown>;
  return (racine.dashboard ?? racine) as Record<string, unknown>;
};

const lireChemin = (source: Record<string, unknown>, chemin: string): string | undefined => {
  const valeur = chemin
    .split('.')
    .reduce<unknown>((noeud, clé) => (noeud as Record<string, unknown>)?.[clé], source);
  return typeof valeur === 'string' ? valeur : undefined;
};

/** Aplati `{a:{b:'x'}}` en `[['a.b','x']]` — seules les feuilles texte comptent. */
const feuilles = (noeud: unknown, préfixe = ''): Array<[string, string]> => {
  if (typeof noeud === 'string') return [[préfixe, noeud]];
  if (!noeud || typeof noeud !== 'object') return [];
  return Object.entries(noeud as Record<string, unknown>).flatMap(([clé, valeur]) =>
    feuilles(valeur, préfixe ? `${préfixe}.${clé}` : clé)
  );
};

describe('Le tableau de bord crée une COMMUNAUTÉ, et le dit dans les quatre langues (#4222)', () => {
  it.each(LANGUES)('%s — aucune chaîne de la modale ne parle de « groupe »', (langue) => {
    const dashboard = chargerDashboard(langue);

    const inspectées = SOUS_ARBRES_DE_LA_MODALE.flatMap((racine) =>
      feuilles(dashboard[racine], racine)
    );

    // Garde-fou du harnais : sans lui, un `dashboard.json` renommé ferait
    // passer cette garde au vert en n'inspectant plus rien.
    expect(inspectées.length).toBeGreaterThanOrEqual(15);

    const fautives = inspectées
      .filter(([, texte]) => MOTS[langue].interdit.test(texte))
      .map(([clé, texte]) => `${clé} = ${texte}`);

    expect(fautives).toEqual([]);
  });

  it.each(LANGUES)('%s — les chaînes qui nomment l’objet créé disent « communauté »', (langue) => {
    const dashboard = chargerDashboard(langue);

    const manquantes = CHAÎNES_QUI_NOMMENT.filter((chemin) => {
      const texte = lireChemin(dashboard, chemin);
      return !texte || !texte.toLowerCase().includes(MOTS[langue].attendu);
    });

    expect(manquantes).toEqual([]);
  });
});
