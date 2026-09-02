import { compacte } from '@/app/enveloppe/feuille';

/**
 * La feuille des DEUX écrans d'authentification.
 *
 * Elle n'ajoute au chrome que la colonne étroite, les champs et l'alerte. Le
 * reste — gouttière, marque, retour, appel à l'action, pied — vient de
 * `app/enveloppe/feuille.ts`, partagé avec la vitrine et les cinq pages
 * institutionnelles.
 *
 * LES CIBLES FONT 52 px DE HAUT, comme les appels à l'action : c'est le
 * plancher de 44 pt de la dimension 5, et il vaut pour un champ autant que pour
 * un bouton. `font-size:var(--text-md)` sur les entrées n'est pas une coquetterie non
 * plus — en dessous, Safari iOS ZOOME au focus, et l'écran saute sous le doigt.
 *
 * L'ALERTE NE DOIT PAS RESSEMBLER À UN CHAMP. Elle a d'abord porté le même
 * rayon et le même filet complet que les entrées, juste au-dessus d'elles : à
 * la capture, elle se lisait comme un champ VIDE dont le message serait le
 * texte d'invite. Un filet à gauche et un fond teinté la rangent du côté des
 * annonces, comme le bloc `.accent` des pages institutionnelles.
 *
 * Aucune COULEUR écrite (§ 3.2 corollaire 2) : `--color-danger` porte l'alerte.
 */
export const FEUILLE_AUTHENTIFICATION = compacte(`
.acces{max-width:420px;margin:0 auto;padding:48px 0 8px}
.acces h1{margin:0 0 10px;font-size:var(--text-3xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.acces>p{margin:0 0 28px;color:var(--color-text-muted);line-height:var(--leading-relaxed)}


.acces form{display:grid;gap:18px}
.champ{display:grid;gap:6px}
.champ label{font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.champ input{min-height:52px;padding:0 16px;font-size:var(--text-md);font-family:inherit;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border-interactive);border-radius:var(--radius-md);width:100%}
.champ .aide{margin:0;font-size:var(--text-xs);line-height:var(--leading-relaxed);color:var(--color-text-subtle)}
.acces button{margin-top:6px;width:100%;cursor:pointer;font-family:inherit;font-size:var(--text-base)}

.apres{margin:26px 0 0;font-size:var(--text-sm);color:var(--color-text-muted);display:grid;gap:10px}
.apres a{color:var(--color-primary)}
`);
