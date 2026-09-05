import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DES RÉGLAGES — six écrans, une feuille.
 *
 * Ils partagent une forme : un en-tête qui ramène, des SECTIONS titrées, et
 * dans chacune soit des RANGÉES qui mènent quelque part, soit un formulaire.
 * Six feuilles auraient été six occasions de faire diverger la même liste.
 *
 * CE QUI LUI EST PROPRE :
 *
 * 1. **Une rangée est un lien de pleine largeur**, cible 44 px, avec son
 *    chevron. Ce n'est pas un `<li>` cliquable par un `onclick` — il n'y a pas
 *    de JavaScript, et un lien est ce qu'un lecteur d'écran annonce comme tel.
 * 2. **Les rangs de langue portent leur NUMÉRO**, pas une puce : l'ordre EST
 *    l'information (le Prisme sert la première langue qui porte le contenu),
 *    et une puce ne dirait pas qu'il compte.
 * 3. **Le choix du thème est un groupe de RADIOS**, pas trois boutons : un
 *    seul est actif, et c'est exactement ce qu'un `radiogroup` dit au clavier
 *    et au lecteur d'écran.
 * 4. **Un champ en erreur garde sa saisie.** La feuille ne dessine que
 *    l'alerte ; c'est la vue qui repose la valeur — perdre ce qu'on vient de
 *    taper est le défaut le plus cher d'un formulaire.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1).
 */
export const FEUILLE_DES_REGLAGES = compacte(`
.reglages{display:flex;flex-direction:column;gap:var(--space-6);max-width:var(--shell-width);margin:0 auto;padding:0 var(--space-4) var(--space-9)}
.reglages>section{display:flex;flex-direction:column;gap:var(--space-3)}
.reglages h2{margin:0;font-size:var(--text-sm);font-weight:var(--font-weight-semibold);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:var(--tracking-wide)}
.reglages .phrase{margin:0;font-size:var(--text-sm);color:var(--color-text-muted)}

.rangs{display:flex;flex-direction:column;gap:var(--space-2);margin:0;padding:0;list-style:none}
.rangee{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3) var(--space-4);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);text-decoration:none;color:var(--color-text)}
.rangee .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.rangee .quoi{font-weight:var(--font-weight-semibold)}
.rangee .sous{font-size:var(--text-sm);color:var(--color-text-muted)}
.rangee svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline);color:var(--color-text-subtle)}
.rangee .rang{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--space-6);height:var(--space-6);border-radius:var(--radius-pill);background:var(--color-bg-sunken);font-size:var(--text-sm);color:var(--color-text-muted)}
.rangee .valeur{font-size:var(--text-sm);color:var(--color-text-muted)}

.champ{display:flex;flex-direction:column;gap:var(--space-2)}
.champ label{font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.champ input,.champ textarea,.champ select{min-height:var(--target-min);padding:var(--space-2) var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text);font:inherit}
.champ textarea{min-height:var(--row-height);resize:vertical}
.champ .aide{font-size:var(--text-sm);color:var(--color-text-muted)}

.choix{display:flex;flex-direction:column;gap:var(--space-2);margin:0;padding:0;border:0}
.choix legend{padding:0;font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.choix label{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg)}

.reglages .retirer{min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);background:none;color:var(--color-text-muted);font:inherit;cursor:pointer}
`);
