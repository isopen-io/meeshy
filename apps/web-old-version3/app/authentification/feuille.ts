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
 * Les `<select>` la partagent : un indicatif de pays et une langue de lecture
 * se touchent du doigt comme un champ se touche.
 *
 * L'ALERTE NE DOIT PAS RESSEMBLER À UN CHAMP. Elle a d'abord porté le même
 * rayon et le même filet complet que les entrées, juste au-dessus d'elles : à
 * la capture, elle se lisait comme un champ VIDE dont le message serait le
 * texte d'invite. Un filet à gauche et un fond teinté la rangent du côté des
 * annonces, comme le bloc `.accent` des pages institutionnelles.
 *
 * `.refus` EST L'INVERSE DE L'ALERTE : il vit SOUS son champ, il est court, et
 * il ne doit surtout pas prendre la place d'un bloc — sinon il repousserait le
 * reste du formulaire à chaque refus et ferait sauter la page sous les doigts.
 * Il emprunte donc la taille et l'interligne de `.aide`, dont il prend la
 * place dans l'ordre de lecture, et n'en change que la couleur.
 *
 * LE DUO PAYS + NUMÉRO EST UNE LIGNE, PAS DEUX CHAMPS. Le `<select>` prend la
 * largeur de son contenu et le numéro le reste — mais son contenu, ce sont
 * 245 options dont « Territoire britannique de l'océan Indien » : sa largeur
 * INTRINSÈQUE est celle de la plus longue, c'est-à-dire inutilisable. `max-width`
 * la borne à un peu plus de la moitié de la colonne, ce qui laisse
 * « 🇫🇷 +33 France » entier, et `text-overflow` coupe proprement les rares noms
 * plus longs plutôt que de les faire disparaître au bord du contrôle.
 * `min-width:0` sur l'entrée n'est pas décoratif : sans lui, la largeur
 * intrinsèque d'un `<input>` empêche le rétrécissement et le duo déborde de la
 * colonne. Sous 360 px — le plancher de la charte —, ils s'empilent : deux
 * cibles de 52 px valent mieux qu'une ligne où aucune des deux n'est
 * touchable.
 *
 * Aucune COULEUR écrite (§ 3.2 corollaire 2) : `--color-danger` porte l'alerte
 * comme le refus.
 */
export const FEUILLE_AUTHENTIFICATION = compacte(`
.acces{max-width:420px;margin:0 auto;padding:48px 0 8px}
.acces h1{margin:0 0 10px;font-size:var(--text-3xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.acces>p{margin:0 0 28px;color:var(--color-text-muted);line-height:var(--leading-relaxed)}


.acces form{display:grid;gap:18px}
.champ{display:grid;gap:6px}
.champ label{font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.champ input,.acces select{min-height:52px;padding:0 16px;font-size:var(--text-md);font-family:inherit;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border-interactive);border-radius:var(--radius-lg);width:100%}
.champ .aide{margin:0;font-size:var(--text-xs);line-height:var(--leading-relaxed);color:var(--color-text-subtle)}
.champ .refus{margin:0;font-size:var(--text-xs);line-height:var(--leading-relaxed);color:var(--color-danger)}
.champ .refus a{color:var(--color-danger)}
.champ input[aria-invalid="true"]{border-color:var(--color-danger)}

.duo{display:flex;gap:8px;align-items:start}
.duo select{width:auto;flex:0 0 auto;max-width:52%;padding:0 8px;text-overflow:ellipsis}
.duo input{flex:1 1 auto;min-width:0}

.pastille{margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:var(--text-sm);color:var(--color-text-muted)}
.pastille label{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.pastille select{width:auto;max-width:100%;color:var(--color-text)}

.conditions{margin:14px 0 0;font-size:var(--text-xs);line-height:var(--leading-relaxed);color:var(--color-text-subtle);text-align:center}

.apres{margin:26px 0 0;font-size:var(--text-sm);color:var(--color-text-muted);display:grid;gap:10px}
.apres a{color:var(--color-primary)}

@media (max-width:359px){
.duo{flex-wrap:wrap}
.duo select,.duo input{flex:1 1 100%;max-width:none}
}
`);
