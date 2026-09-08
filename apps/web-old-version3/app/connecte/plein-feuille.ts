import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DU PLEIN ÉCRAN — servie UNIQUEMENT dans l'état `?media=`
 * (`app/connecte/fil-vue.ts`) : ce que le fil n'affiche pas, il ne le paie pas
 * (charte règle 7, « la feuille est découpée par ROUTE »). Un fil ordinaire ne
 * porte donc pas un octet de ces règles.
 *
 * ELLE EST PLEINE PAGE, PAS FLOTTANTE. Un visionneur de média REMPLACE l'écran
 * le temps qu'on regarde — il ne se pose pas dessus : son fond est
 * `--color-bg`, le plan de la page, et jamais `--color-surface-raised`, que la
 * charte réserve à ce qui FLOTTE (règle 9, une seule feuille modale dans tout
 * le dépôt). Il n'a pas de voile pour la même raison : rien ne dépasse, donc
 * rien n'est « à côté » ; on ferme par la croix — 44 px, en haut à droite,
 * là où le pouce la cherche — ou par Échap dès que le module a élevé le
 * `<dialog>` en modale (`lib/realtime/plein-ecran.ts`).
 *
 * LA VIDÉO A UNE BOÎTE, MÊME SANS MÉTADONNÉE. En `preload="none"` — et c'est le
 * choix de cet écran : la surimpression MONTRE, elle ne dépense pas les octets
 * à la place du lecteur — un `<video>` n'a aucun rapport intrinsèque à offrir,
 * donc le navigateur retombe sur ses 300 × 150 par défaut : le « plein écran »
 * d'une vidéo était plus PETIT que son affiche dans le fil. `width`/`height`
 * sont portés par la balise quand la passerelle les sert (`plein-vue.ts`), et
 * la règle `:not([width])` donne le rapport quand elle ne les sert pas.
 *
 * LA SCÈNE S'ENFONCE (`--color-bg-sunken`, règle 17) et le média y est CONTENU
 * (`max-width`/`max-height` à 100 %) : une photo de 4 000 px de large ne déborde
 * pas, une photo verticale n'écrase pas la fiche. La boîte de la scène est
 * connue AVANT que l'image n'arrive — c'est la rangée souple d'une colonne de
 * `100dvh` —, donc l'arrivée des octets ne décale rien (CLS ≤ 0,05).
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DU_PLEIN = compacte(`
dialog.plein{position:fixed;inset:0;z-index:5;box-sizing:border-box;display:flex;flex-direction:column;gap:var(--space-4);width:100%;max-width:none;height:100dvh;max-height:none;margin:0;padding:var(--space-4);border:0;background:var(--color-bg);color:var(--color-text)}
dialog.plein::backdrop{background:var(--color-overlay)}
dialog.plein>*{flex:none}
dialog.plein header{display:flex;align-items:center;gap:var(--space-3)}
dialog.plein .titre{flex:1;min-width:0}
dialog.plein h2{margin:0;font-size:var(--text-lg);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
dialog.plein .poids{margin:0;font-size:var(--text-sm);color:var(--color-text-muted)}
dialog.plein .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);color:var(--color-primary)}
dialog.plein .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.plein .scene{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:calc(var(--row-height) * 2);padding:var(--space-2);border-radius:var(--radius-lg);background:var(--color-bg-sunken);overflow:hidden}
.media-plein{display:block;max-width:100%;max-height:100%;width:auto;height:auto;border-radius:var(--radius-lg)}
video.media-plein{width:100%;height:auto}
video.media-plein:not([width]){aspect-ratio:16/9}
audio.media-plein{width:100%;height:var(--action-height)}
dialog.plein[data-genre=audio] .scene{flex:none;min-height:0;padding:var(--space-4)}
dialog.plein[data-genre=audio] .fiche-texte{flex:1 1 auto}
dialog.plein .fiche-texte{flex:0 1 auto;display:grid;gap:var(--space-2);align-content:start;overflow:auto}
dialog.plein .action svg{flex:none;width:var(--glyph);height:var(--glyph)}
dialog.plein .fiche-texte:empty{display:none}
dialog.plein .transcription{margin:0;padding-left:var(--space-3);border-left:var(--stroke-strong) solid var(--color-border-interactive);font-size:var(--text-base)}
dialog.plein .transcrit{display:flex;align-items:center;gap:var(--space-2);margin:0;font-size:var(--text-sm);color:var(--color-text-muted)}
dialog.plein .transcrit-original{margin:0}
dialog.plein .transcrit-original summary{display:inline-flex;align-items:center;gap:var(--space-2);min-height:var(--target-min);font-size:var(--text-sm);color:var(--color-primary);list-style:none;cursor:pointer}
dialog.plein .transcrit-original summary::-webkit-details-marker{display:none}
dialog.plein .transcrit-original summary svg{width:var(--glyph-inline);height:var(--glyph-inline)}
dialog.plein .transcrit-original p{margin:0;color:var(--color-text-muted);white-space:pre-wrap;overflow-wrap:anywhere}

@media (min-width:600px){
dialog.plein{padding:var(--space-5)}
}
`);
