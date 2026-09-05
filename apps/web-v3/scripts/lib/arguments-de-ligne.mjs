// CE QU'UN OUTIL DE VÉRIFICATION ACCEPTE SUR SA LIGNE DE COMMANDE [L-0.5].
//
// `capture-cibles.js` prenait `process.argv[2]` pour un dossier de sortie sans
// jamais regarder si c'en était un : `node capture-cibles.js --vues linkRedirect`
// créait un dossier nommé `--vues/` à la racine du dépôt et y écrivait les 37
// captures. Deux dossiers de ce genre (`--help/`, `--vues/`) ont été trouvés non
// suivis dans l'arbre de travail au moment de livrer le lot L1.
//
// Le défaut n'est pas la faute de frappe, c'est le REPLI : l'outil n'honore aucun
// drapeau, et un argument qu'il n'honore pas doit sortir en refus nommé, jamais
// devenir une valeur par défaut déguisée.

export const dossierDeSortie = (argumentsDeLigne, defaut) => {
  const premier = argumentsDeLigne[0];
  if (premier === undefined || premier === '') return { ok: true, dossier: defaut };
  if (premier.startsWith('-')) {
    return {
      ok: false,
      raison:
        `« ${premier} » n'est pas un dossier de sortie : cet outil n'honore aucun drapeau, et ` +
        `l'accepter créerait un dossier portant ce nom. Passer un CHEMIN, ou rien`,
    };
  }
  return { ok: true, dossier: premier };
};
