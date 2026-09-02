import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA MODALE DE `/chat/:lien` (charte règle 25) — une feuille basse sur mobile,
 * centrée au-delà de 600 px, sur un voile fixe ; derrière elle, le cadre du fil
 * est `inert` et flouté par la feuille du fil elle-même.
 *
 * CE QUE LA PLANCHE DESSINE, ET QUE LA FEUILLE REPRODUIT (`cible/join.png`) :
 * le nom de la place en titre d'écran (`--text-3xl`), la citation en retrait,
 * l'accordéon des droits sur son propre plan avec son glyphe à l'accent (c'est
 * un `<summary>`, donc du cliquable — règle 13), le pseudo et la langue CÔTE À
 * CÔTE sur une ligne (deux champs de 56 px, `--field-height`), l'action
 * principale avec son fantôme, le filet « ou garder votre identité », les deux
 * actions du compte, et la note qui promet le retour. Les champs qu'un lien
 * exige EN PLUS (courriel, date de naissance) prennent toute la largeur, sous
 * la ligne.
 *
 * `--color-surface-raised` n'a que deux emplois dans toute la v3 (règle 9) :
 * cette feuille, et le rond flottant secondaire. Les champs et l'accordéon
 * prennent `--color-surface` — le plan d'en dessous, qui les détache de la
 * feuille — et le contour `--color-border-interactive` ; le refus se dit en
 * `--color-danger`, jamais en `--color-danger-soft` (règle 14, mesuré 3,61:1
 * en clair).
 *
 * LA FEUILLE A UNE HAUTEUR RÉSERVÉE, ÉGALE AU CONTENU NOMINAL DE SA VARIANTE,
 * et c'est le gate CLS qui la décide (§ 12.6, ≤ 0,05). Bornée par un
 * `max-height` seul, elle GRANDISSAIT à mesure que son contenu arrivait en 3G
 * — ancrée en bas, chaque morceau la repoussait vers le haut sous les yeux du
 * visiteur (mesuré : 258 px puis 685 px, CLS 0,347). Une hauteur posée
 * d'avance ne bouge pas ; son contenu se range en haut et défile s'il
 * déborde. Mais UNE hauteur pour toutes les variantes ne convenait à aucune :
 * à 92dvh, la modale nominale laissait 131 px de vide sous sa note à 390×844
 * (83 % de feuille occupée) et le cadre flouté n'était plus qu'un bandeau de
 * 68 px, là où la planche (`cible/join.png`) fait commencer la feuille vers
 * 26 % de la hauteur, épousant son contenu. Le serveur sait quelle variante
 * il compose (`choix-vue.ts` › `varianteDeLaFeuille`) et réserve la sienne,
 * MESURÉE à 390×844 (`.cache/web-v3-workflow/recette/join/correctifs`, spec
 * `geometrie`) : la NOMINALE (pseudo + langue, 670 px de contenu) tient dans
 * 80dvh ; l'ÉTENDUE (courriel et date de naissance en plus, 862 px) prend
 * 92dvh et défile ; la BRÈVE (aucun formulaire — refus du lien, compte exigé,
 * 554 px) tient dans 67dvh ; la FERMÉE (lien clos avant tout choix, sans
 * aperçu : 447 px) dans 54dvh. Au-delà de 600 px la feuille est centrée et
 * garde une hauteur par variante pour la même raison. Sur un cadre plus court
 * (360×640) chaque variante défile, l'action principale restant au-dessus du
 * pli pour la nominale.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DU_CHOIX = compacte(`
.voile{position:fixed;inset:0;z-index:4;background:var(--color-overlay)}
dialog.feuille{position:fixed;inset:auto 0 0;z-index:5;box-sizing:border-box;width:100%;max-width:none;height:80dvh;overflow:auto;margin:0;padding:var(--space-3) var(--space-5) var(--space-5);border:0;border-radius:var(--radius-2xl) var(--radius-2xl) 0 0;background:var(--color-surface-raised);color:var(--color-text)}
dialog.feuille.etendue{height:92dvh}
dialog.feuille.breve{height:67dvh}
dialog.feuille.fermee{height:54dvh}
dialog.feuille::backdrop{background:var(--color-overlay)}
.poignee{display:block;width:var(--glyph-large);height:var(--space-1);margin:0 auto var(--space-4);border-radius:var(--radius-pill);background:var(--color-border-strong)}
.feuille .hote{margin:0;display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-base);color:var(--color-text-muted)}
.feuille .hote svg{flex:none;width:var(--glyph);height:var(--glyph)}
.feuille h2{margin:var(--space-2) 0 0;font-size:var(--text-3xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.feuille .question{margin:var(--space-1) 0 0;font-size:var(--text-base);color:var(--color-text-muted)}
.feuille blockquote{margin:var(--space-3) 0 0;padding:0 0 0 var(--space-3);border-left:var(--stroke-strong) solid var(--color-border-strong);color:var(--color-text-muted);max-width:var(--measure)}
.feuille .droits{margin-top:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);padding:0 var(--space-4);background:var(--color-surface)}
.feuille .droits summary{display:flex;align-items:center;gap:var(--space-3);min-height:var(--field-height);padding:var(--space-2) 0;list-style:none;cursor:pointer}
.feuille .droits summary::-webkit-details-marker{display:none}
.feuille .droits summary>svg{flex:none;width:var(--glyph);height:var(--glyph);color:var(--color-primary)}
.feuille .droits summary b{display:block;font-weight:var(--font-weight-semibold)}
.feuille .droits summary p{margin:0;font-size:var(--text-sm);color:var(--color-text-muted)}
.feuille .droits .caret{margin-left:auto;color:var(--color-text-muted)}
.feuille .droits .caret svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.feuille .droits ul{margin:0;padding:0 0 var(--space-3);list-style:none}
.feuille .droits li{display:flex;gap:var(--space-3);padding:var(--space-2) 0;border-top:var(--stroke-hair) solid var(--color-border-strong);font-size:var(--text-base)}
.feuille .droits li svg{flex:none;width:var(--glyph);height:var(--glyph);color:var(--color-text-muted)}
.feuille .droits li b{display:block;font-weight:var(--font-weight-semibold)}
.feuille .droits li p{margin:0;color:var(--color-text-muted)}
.feuille form{margin-top:var(--space-5);display:grid;gap:var(--space-3)}
.champs{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);align-items:start}
.champ{display:grid;gap:var(--space-1);min-width:0}
.champ.large{grid-column:1/-1}
.champ label{font-size:var(--text-base);font-weight:var(--font-weight-medium)}
.champ input,.champ select{box-sizing:border-box;width:100%;min-width:0;min-height:var(--field-height);padding:0 var(--space-4);font:inherit;color:var(--color-text);background:var(--color-surface);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-lg)}
.champ .refus{margin:0;font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-danger)}
.champ.en-refus input{border-color:var(--color-danger)}
.feuille .action.primaire svg{flex:none;width:var(--glyph);height:var(--glyph)}
.feuille .ou{display:flex;align-items:center;gap:var(--space-3);margin:var(--space-4) 0 var(--space-3);font-size:var(--text-sm);color:var(--color-text-subtle)}
.feuille .ou::before,.feuille .ou::after{content:"";flex:1;border-top:var(--stroke-hair) solid var(--color-border-strong)}
.feuille .action + .action{margin-top:var(--space-3)}
.feuille .action.discrete{width:100%}
.feuille .note{margin:var(--space-4) auto 0;max-width:var(--measure);text-align:center;font-size:var(--text-sm);color:var(--color-text-subtle)}
.feuille .bandeau{margin:var(--space-4) 0 0}
.feuille .bandeau + .action{margin-top:var(--space-4)}

@media (min-width:600px){
dialog.feuille{inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(100%,var(--shell-width));height:88dvh;border-radius:var(--radius-lg)}
dialog.feuille.etendue{height:92dvh}
dialog.feuille.breve{height:67dvh}
dialog.feuille.fermee{height:54dvh}
.feuille .action,.feuille .action.discrete{width:100%}
.poignee{display:none}
}
`);
