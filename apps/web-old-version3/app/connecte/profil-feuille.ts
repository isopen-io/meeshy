import { compacte } from '@/app/enveloppe/feuille';

import { feuilleQuiMonte } from './atomes-feuille';

/**
 * LA FEUILLE DU PROFIL D'UN PARTICIPANT (§ 12.10.3) — une feuille BASSE sur
 * mobile, centrée au-delà de 600 px — la géométrie que `feuilleQuiMonte`
 * (`choix-feuille.ts`) : les deux flottent sur le MÊME plan
 * (`--color-surface-raised`, second emploi assumé de la règle 9), et une
 * troisième feuille flottante réinventerait une géométrie déjà jugée.
 *
 * ELLE NE FLOUTE PAS CE QU'ELLE RECOUVRE (§ 12.10.3 point 3) : le flou de
 * l'état CHOIX protège un contenu qui ne doit PAS partir avant un choix ; ici
 * le lecteur est déjà dans la conversation, et un `filter:blur` de plus ne
 * protégerait rien — juste du GPU. Le SEUL `filter:blur` du dépôt reste celui
 * du cadre inerte de `/chat/:lien` (charte, témoin `charte.test.ts`).
 *
 * HAUTEUR AUTO, PAS RÉSERVÉE : contrairement à la modale de jonction — dont le
 * contenu est connu D'AVANCE par variante —, le contenu d'un profil varie
 * (bio ou non, trois lignes d'info ou une, trois actions ou zéro) sans qu'une
 * page ne CHARGE progressivement derrière : tout arrive dans le MÊME document,
 * en un seul rendu — la cause du CLS mesuré sur la modale de jonction (contenu
 * arrivant en 3G) ne s'applique pas ici, `max-height` seule suffit.
 *
 * TROIS CHEMINS DE FERMETURE, CHACUN UN `<a href>` VERS L'ADRESSE DE L'HÔTE —
 * la croix (44 px, en haut à droite), le voile (tout l'écran derrière) et la
 * poignée (pleine largeur, 44 px de haut, le petit trait n'étant que son
 * repère visuel) : sans JavaScript, chacun est un lien ordinaire ; avec lui,
 * `lib/realtime/plein-ecran.ts` élève le `<dialog open data-retour>` en
 * modale et Échap suit le même chemin.
 *
 * LA GÉOMÉTRIE N'EST PLUS ÉCRITE ICI : `feuilleQuiMonte('profil')`
 * (`atomes-feuille.ts`) la sert, et la feuille « nouveau lien » la sert aussi.
 * Cette feuille-ci ne porte plus que ce qui lui est PROPRE — sa tête, son
 * identité, sa relation, sa bio.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DU_PROFIL = feuilleQuiMonte('profil') + compacte(`
dialog.profil .tete{display:flex;align-items:flex-start;gap:var(--space-3)}
dialog.profil .identite{flex:1;min-width:0;display:flex;align-items:center;gap:var(--space-3)}
dialog.profil .identite .avatar{width:var(--space-8);height:var(--space-8);font-size:var(--text-lg)}
dialog.profil .identite h2{margin:0;font-size:var(--text-2xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);overflow-wrap:anywhere}
dialog.profil .pseudo{margin:0;color:var(--color-text-muted)}
dialog.profil .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text)}
dialog.profil .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.profil .relation{display:inline-flex;align-items:center;margin:var(--space-3) 0 0;padding:0 var(--space-3);min-height:var(--space-8);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);font-size:var(--text-sm);font-weight:var(--font-weight-semibold);letter-spacing:.02em;text-transform:uppercase;color:var(--color-text-muted)}
dialog.profil .relation[data-relation=friend]{color:var(--color-success);border-color:var(--color-success)}
dialog.profil .bio{margin:var(--space-4) 0 0;color:var(--color-text);max-width:var(--measure)}
dialog.profil .infos{margin:var(--space-4) 0 0;padding:0 var(--space-4);list-style:none;border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}
dialog.profil .infos li{display:flex;gap:var(--space-3);padding:var(--space-3) 0;border-top:var(--stroke-hair) solid var(--color-border-strong)}
dialog.profil .infos li:first-child{border-top:0}
dialog.profil .infos .glyphe{flex:none;width:var(--glyph);height:var(--glyph);color:var(--color-text-muted)}
dialog.profil .infos b{display:block;font-weight:var(--font-weight-semibold)}
dialog.profil .infos p{margin:0;color:var(--color-text-muted)}
dialog.profil .actions-profil{margin-top:var(--space-4);display:grid;gap:var(--space-3)}
dialog.profil .actions-profil svg{flex:none;width:var(--glyph);height:var(--glyph)}
dialog.profil .actions-profil form{display:contents}
dialog.profil .action.discrete{width:100%}
dialog.profil .action.grave{color:var(--color-danger)}
dialog.profil .action.primaire.grave{background:var(--color-danger);color:var(--color-on-primary)}
dialog.profil .action.primaire.grave:hover{background:var(--color-danger)}
dialog.profil .message{display:grid;justify-items:center;gap:var(--space-2);padding:var(--space-6) 0;text-align:center}
dialog.profil .message svg{width:var(--space-8);height:var(--space-8);color:var(--color-text-muted)}
dialog.profil .message h2{margin:0;font-size:var(--text-xl);font-weight:var(--font-weight-semibold)}
dialog.profil .message p{margin:0;color:var(--color-text-muted);max-width:var(--measure)}
dialog.profil .confirmation{margin-top:var(--space-2)}
dialog.profil .confirmation .question{margin:0;font-size:var(--text-lg);font-weight:var(--font-weight-semibold)}
dialog.profil .confirmation .precision{margin:var(--space-1) 0 0;color:var(--color-text-muted)}
dialog.profil .confirmation form{margin-top:var(--space-4)}
dialog.profil .confirmation .action.discrete{margin-top:var(--space-3)}

@media (min-width:600px){
dialog.profil{inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(100%,var(--shell-width));max-height:80dvh;padding:0 var(--space-5) var(--space-5);border-radius:var(--radius-lg)}
dialog.profil .poignee{display:none}
}
`);
