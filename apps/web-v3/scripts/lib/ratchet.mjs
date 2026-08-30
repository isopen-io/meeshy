/**
 * Le RATCHET du § 8.3 — la moitie de la phrase que personne n'avait ecrite.
 *
 * « CIBLE = valeur a confirmer par la premiere mesure ; jusque-la le gate
 * ENREGISTRE la valeur mesuree et interdit toute REGRESSION (ratchet
 * strictement decroissant). »
 *
 * La premiere moitie — « une CIBLE se rapporte, elle ne casse pas la CI » —
 * etait implementee. La seconde ne l'etait pas : rien n'enregistrait la valeur
 * mesuree, donc aucune regression ne pouvait etre detectee, ni avant ni apres
 * la premiere mesure. Consequence chiffree : sur les lignes de `budgets.json`,
 * une seule portait un plafond de bundle GATE — `/l/:token`, l'ecran a 0 o,
 * c'est-a-dire la route SANS bundle, celle qui n'apparait meme pas dans le
 * manifeste. Le gate de bundle ne pouvait litteralement pas echouer.
 *
 * Ce fichier pose donc la seconde moitie, et une seule regle : une valeur
 * ENREGISTREE ne remonte jamais. Elle n'est pas un plafond negocie — c'est le
 * meilleur etat atteint, et le franchir est un ECHEC meme quand le plafond
 * CIBLE, lui, tient encore.
 *
 * Ce qui entre dans le ratchet : des OCTETS et des COMPTES. Pas des TEMPS —
 * un FCP varie d'un tirage a l'autre, et un cliquet sur une grandeur bruitee
 * transforme le gate en generateur d'echecs aleatoires, ce qui le fait
 * desactiver en une semaine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const RATCHET_VIDE = { _loi: null, genere_le: null, valeurs: {} };

export function lireRatchet(fichier) {
  if (!existsSync(fichier)) return { ...RATCHET_VIDE, valeurs: {} };
  try {
    const contenu = JSON.parse(readFileSync(fichier, 'utf8'));
    return { ...contenu, valeurs: contenu.valeurs ?? {} };
  } catch (erreur) {
    throw new Error(`ratchet illisible (${fichier}) : ${erreur.message}`);
  }
}

/**
 * Ce qui a REMONTE depuis la derniere mesure enregistree. Une cle absente de
 * l'enregistrement n'est pas une regression : c'est une mesure neuve, et une
 * mesure neuve n'a rien contre quoi regresser.
 */
export function confronterRatchet({ enregistre, courant }) {
  return Object.entries(courant)
    .filter(([cle, valeur]) => typeof enregistre[cle] === 'number' && valeur > enregistre[cle])
    .map(
      ([cle, valeur]) =>
        `${cle} : ${valeur} > ${enregistre[cle]} enregistre — REGRESSION (le ratchet du § 8.3 est strictement decroissant)`,
    );
}

/** L'enregistrement suivant : le MINIMUM par cle. Ce qui a baisse devient la nouvelle reference. */
export function fusionnerRatchet({ enregistre, courant }) {
  const fusion = { ...enregistre };
  for (const [cle, valeur] of Object.entries(courant)) {
    fusion[cle] = typeof fusion[cle] === 'number' ? Math.min(fusion[cle], valeur) : valeur;
  }
  return fusion;
}

export function ecrireRatchet({ fichier, valeurs, source }) {
  mkdirSync(dirname(fichier), { recursive: true });
  const contenu = {
    _loi: "le MEILLEUR etat atteint, par mesure. Une valeur ne remonte jamais : le gate echoue sur toute remontee, meme quand le plafond CIBLE de budgets.json tient encore (§ 8.3, « ratchet strictement decroissant »). Ce fichier est COMMITE — c'est ce qui rend la regression detectable d'une CI a l'autre.",
    _porte: 'des OCTETS et des COMPTES seulement. Les temps (FCP, LCP) varient d\'un tirage a l\'autre et n\'entrent pas dans un cliquet.',
    _enregistre_par: source,
    genere_le: new Date().toISOString(),
    valeurs,
  };
  writeFileSync(fichier, `${JSON.stringify(contenu, null, 2)}\n`);
  return contenu;
}
