/**
 * #4589 — **une clé que le schéma ne déclare pas est REFUSÉE, dans les SEPT
 * catégories.**
 *
 * ## Le défaut
 *
 * Mesuré sur staging le 2026-08-31 :
 *
 * ```
 * PATCH /api/v1/me/preferences/privacy  {"profileVisibility":"private"}
 * → 200 {"success": true}          … et rien n'est écrit
 * ```
 *
 * `profileVisibility` n'existe pas. Le mode *strip* de Zod — le défaut d'un
 * `z.object()` nu — retirait la clé en silence. Un client qui se trompe de nom
 * recevait la confirmation que son réglage était enregistré ; c'est la
 * RELECTURE, jamais la réponse, qui montrait que rien n'avait bougé.
 *
 * ## Pourquoi ce fichier boucle sur les sept
 *
 * C'est le critère 3 de l'issue, et il n'est pas décoratif : la rigueur est
 * posée dans `submittedFrom`, que les sept catégories traversent — mais
 * « traversent » est une propriété du code d'aujourd'hui, pas une garantie.
 * Une catégorie qui gagnerait demain son propre chemin d'écriture mentirait
 * seule, et un témoin posé sur une seule catégorie resterait vert.
 *
 * La boucle est donc dérivée du REGISTRE, jamais d'une liste écrite à la
 * main : une huitième catégorie est couverte le jour où elle est déclarée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PREFERENCE_REGISTRY, parseSubmittedKeys } from '../../../../../routes/me/preferences/preference-registry';

const CATEGORIES = Object.keys(PREFERENCE_REGISTRY) as Array<keyof typeof PREFERENCE_REGISTRY>;

describe('#4589 — aucune catégorie n\'accepte en silence une clé inconnue', () => {
  it('le registre déclare bien les sept catégories — sinon la boucle ne garderait rien', () => {
    // Cas positif : une boucle vide passe au vert en ne testant rien.
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(7);
  });

  it.each(CATEGORIES)('catégorie %s : une clé inconnue LÈVE', (categorie) => {
    expect(() =>
      parseSubmittedKeys(categorie, { cetteCleNExistePas: 'x' })
    ).toThrow();
  });

  it.each(CATEGORIES)('catégorie %s : l\'erreur NOMME la clé refusée dans `keys`', (categorie) => {
    try {
      parseSubmittedKeys(categorie, { cetteCleNExistePas: 'x' });
      throw new Error('aurait dû lever');
    } catch (erreur) {
      const issues = (erreur as { issues?: Array<{ code: string; keys?: string[] }> }).issues;
      expect(issues).toBeDefined();
      const inconnue = (issues ?? []).find((i) => i.code === 'unrecognized_keys');
      expect(inconnue).toBeDefined();
      expect(inconnue?.keys).toContain('cetteCleNExistePas');
    }
  });

  it.each(CATEGORIES)('catégorie %s : un corps VIDE reste accepté — la rigueur ne referme pas la porte', (categorie) => {
    // Sans ce contrôle, « tout refuser » rendrait le même verdict que
    // « refuser ce qui n'est pas déclaré ».
    expect(() => parseSubmittedKeys(categorie, {})).not.toThrow();
  });
});
