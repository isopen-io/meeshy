/**
 * Le catalogue `pt` est BRÉSILIEN — mesuré, pas décidé ici.
 *
 * Avant ce lot, `apps/web/locales/pt/` portait 335 occurrences de formes
 * brésiliennes (`tela`, `arquivo`, `senha`, `configurações`, `celular`,
 * `Salvar`, `Excluir`) contre 29 européennes, et sur les verbes seuls
 * `Excluir` 53 contre `Eliminar` 7. Ce cliquet ne CHOISIT pas une variante :
 * il empêche la seconde de réapparaître dans un catalogue qui est déjà la
 * première à plus de 90 %.
 *
 * Pourquoi c'est un défaut produit et pas une coquetterie : un lecteur
 * brésilien lisait « leitores de ecrã » dans les réglages d'accessibilité et
 * « leitores de tela » dans le composeur — deux mots différents pour la même
 * chose, dans la même application. C'est la dimension 6 (cohérence de
 * positionnement : même mot partout), pas la dimension 9.
 *
 * QUATRE paires seulement, et c'est une décision : chacune n'a AUCUN
 * recouvrement entre les deux normes. `Eliminar` et `Guardar` sont
 * délibérément EXCLUS — ils s'emploient aussi au Brésil, donc les garder
 * produirait des faux positifs, et un cliquet qui crie à tort finit désactivé.
 * La règle qu'il porte est donc étroite et vraie, jamais large et discutable.
 *
 * Les bornes de mot comptent : `Predefinições` n'est pas `definições`, et
 * l'attraper aurait fait rougir `audioEffects.json` sans raison.
 */

import fs from 'fs';
import path from 'path';

const PT_DIR = path.join(__dirname, '../../locales/pt');

/** Forme européenne → forme brésilienne. Aucun recouvrement entre les deux. */
const PAIRES_SANS_RECOUVREMENT: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?<![0-9A-Za-zÀ-ÿ-])ecrãs?(?![0-9A-Za-zÀ-ÿ-])/i, 'tela(s)'],
  [/(?<![0-9A-Za-zÀ-ÿ-])ficheiros?(?![0-9A-Za-zÀ-ÿ-])/i, 'arquivo(s)'],
  [/(?<![0-9A-Za-zÀ-ÿ-])palavras?-passe(?![0-9A-Za-zÀ-ÿ-])/i, 'senha(s)'],
  [/(?<![0-9A-Za-zÀ-ÿ-])definições(?![0-9A-Za-zÀ-ÿ-])/i, 'configurações'],
  [/(?<![0-9A-Za-zÀ-ÿ-])telemóve(l|is)(?![0-9A-Za-zÀ-ÿ-])/i, 'celular(es)'],
];

type Feuille = { readonly fichier: string; readonly chemin: string; readonly valeur: string };

function feuilles(objet: unknown, fichier: string, chemin = ''): Feuille[] {
  if (typeof objet === 'string') return [{ fichier, chemin, valeur: objet }];
  if (objet === null || typeof objet !== 'object') return [];
  return Object.entries(objet as Record<string, unknown>).flatMap(([cle, valeur]) =>
    feuilles(valeur, fichier, chemin ? `${chemin}.${cle}` : cle),
  );
}

function toutesLesFeuilles(): Feuille[] {
  return fs
    .readdirSync(PT_DIR)
    .filter((n) => n.endsWith('.json'))
    .flatMap((nom) =>
      feuilles(JSON.parse(fs.readFileSync(path.join(PT_DIR, nom), 'utf8')), nom),
    );
}

describe('Le catalogue pt emploie une seule norme, la brésilienne', () => {
  it('ne porte aucune forme européenne des paires sans recouvrement', () => {
    const fautives = toutesLesFeuilles().flatMap((f) =>
      PAIRES_SANS_RECOUVREMENT.filter(([europeenne]) => europeenne.test(f.valeur)).map(
        ([europeenne, bresilienne]) =>
          `${f.fichier} · ${f.chemin} → « ${f.valeur.match(europeenne)?.[0]} » (attendu : ${bresilienne})\n      ${f.valeur.slice(0, 100)}`,
      ),
    );

    expect(fautives).toEqual([]);
  });

  /**
   * Une garde négative dont le balayage ne lit RIEN reste verte pour toujours.
   * Celle-ci prouve d'abord qu'elle voit le catalogue, puis qu'elle sait
   * reconnaître ce qu'elle cherche — sans quoi le témoin ci-dessus
   * n'attesterait que sa propre inaction.
   */
  it('balaie bien le catalogue, et reconnaît ce qu\'il cherche', () => {
    const lues = toutesLesFeuilles();
    expect(lues.length).toBeGreaterThan(1000);
    expect(new Set(lues.map((f) => f.fichier)).size).toBeGreaterThan(20);

    const [ecra] = PAIRES_SANS_RECOUVREMENT;
    expect(ecra[0].test('leitores de ecrã')).toBe(true);
    expect(ecra[0].test('leitores de tela')).toBe(false);

    // `Predefinições` contient `definições` et n'est PAS une forme européenne :
    // c'est la borne de mot, pas la liste, qui l'épargne.
    const definicoes = PAIRES_SANS_RECOUVREMENT[3][0];
    expect(definicoes.test('Predefinições')).toBe(false);
    expect(definicoes.test('nas suas definições')).toBe(true);
  });
});
