import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DE LA GALERIE — ce que `cible/media.png` dessine, et rien de plus.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL : l'écran
 * partage avec lui son en-tête (`.fil-tete`, son retour de 44 px, son titre
 * tronqué), ses puces (`.puce`), son lecteur replié (`.lecteur`, `.lire`,
 * `.rail`, `.etiquette`) et son bloc de transcription (`.transcription`,
 * `.transcrit`, `.transcrit-original`). Réécrire ces sept formes ici aurait
 * fait deux vocabulaires pour un même geste, sur deux écrans que le lecteur
 * enchaîne d'un tap — c'est la dimension 6 (cohérence de positionnement) perdue
 * entre deux écrans voisins.
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **La grille est à TROIS colonnes de tuiles CARRÉES** (`aspect-ratio:1`),
 *    quatre au-delà du point de rupture. La tuile RÉSERVE sa boîte avant tout
 *    octet : c'est ce qui rend le CLS nul par construction, et non un
 *    `width`/`height` posé sur une image — puisque cet écran ne sert AUCUNE
 *    image (règle du § 8.5 tenue par un autre moyen que celui qu'elle nomme,
 *    parce que la mission « très faible consommation de données » interdit ici
 *    la vignette elle-même).
 * 2. **Les vocaux sont une SECONDE liste, sous la grille** — ce que la cible
 *    dessine. Une liste unique où le vocal aurait pris la rangée entière
 *    laissait des TROUS (mesuré : une tuile seule, deux colonnes vides), et
 *    `grid-auto-flow:dense` les aurait bouchés en désaccordant l'ordre visuel
 *    de l'ordre du DOM — donc de l'ordre du clavier. Chaque liste garde son
 *    ordre chronologique.
 * 3. **Le glyphe DIT le genre** — la table `FORME_PAR_GENRE` l'élit
 *    (`lib/api/formes.ts`) ; la feuille ne fait que lui donner sa taille.
 * 4. **Le poids est SOUS le glyphe, toujours** : la cible ne l'affiche que sur
 *    la tuile différée, et cet écran n'a QUE des tuiles différées — rien ne se
 *    télécharge avant le geste, donc tout s'annonce.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_MEDIAS = compacte(`
.medias-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.medias-ecran>.fil-tete,.medias-ecran>.puces{flex:none}

.puces.filtres{flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;padding-bottom:var(--space-2)}
.puces.filtres .puce{flex:none;text-decoration:none}
.puces.filtres .puce[aria-current]{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-on-primary)}

.galerie{flex:1 1 0;min-height:0;overflow-y:auto;padding:var(--space-4) var(--space-4) var(--space-9)}
.grille{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-2);margin:0;padding:0;list-style:none}
.grille>li{min-width:0}

.tuile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-2);aspect-ratio:1;padding:var(--space-2);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text-muted);text-decoration:none}
.tuile .vignette{display:flex;align-items:center;justify-content:center;line-height:0;color:var(--color-text-muted)}
.tuile .vignette svg{width:var(--glyph-large);height:var(--glyph-large)}
.tuile .poids{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--space-1);max-width:100%;font-size:var(--text-sm);line-height:var(--leading-tight);color:var(--color-text-muted);text-align:center;overflow-wrap:anywhere}
.tuile .poids svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}

.lecteurs{display:grid;gap:var(--space-4);margin:var(--space-4) 0 0;padding:0;list-style:none}
.lecteurs>li{min-width:0}
.lecteurs .lecteur>summary{background:var(--color-surface)}
.lecteurs .etiquette{display:flex;flex-wrap:wrap;align-items:baseline;flex:0 1 auto;gap:var(--space-2);min-width:0}
.lecteurs .nom-de-piece{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lecteurs .poids{font-size:var(--text-sm);color:var(--color-text-muted)}
.lecteurs audio{display:block;width:100%;border-radius:var(--radius-lg);background:var(--color-bg-sunken)}
.lecteurs .transcription{margin:var(--space-2) 0 0;padding-left:var(--space-3);border-left:var(--stroke-strong) solid var(--color-border-interactive);font-size:var(--text-base)}
.lecteurs .transcrit{display:flex;align-items:center;gap:var(--space-1);margin:var(--space-1) 0 0;font-size:var(--text-sm);color:var(--color-text-muted)}
.lecteurs .transcrit-original{margin:0}
.lecteurs .transcrit-original summary{display:inline-flex;align-items:center;gap:var(--space-1);min-height:var(--target-min);font-size:var(--text-sm);color:var(--color-primary);list-style:none;cursor:pointer}
.lecteurs .transcrit-original summary::-webkit-details-marker{display:none}
.lecteurs .transcrit-original summary svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.lecteurs .transcrit-original p{margin:0;color:var(--color-text-muted);white-space:pre-wrap;overflow-wrap:anywhere}

.galerie .plus-ancien{margin:var(--space-5) auto 0}

@media (min-width:600px){
.grille{grid-template-columns:repeat(4,1fr)}
}
`);
