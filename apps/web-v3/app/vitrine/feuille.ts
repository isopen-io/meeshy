import { compacte } from '@/app/enveloppe/feuille';

/**
 * La feuille PROPRE à la vitrine — ce que la page d'accueil ajoute au chrome.
 *
 * Le chrome lui-même (gouttière, marque, appels à l'action, titre de section,
 * pied) vit dans `app/enveloppe/feuille.ts` depuis que les cinq pages
 * institutionnelles le partagent : il appartient au SITE, pas à cet écran. Les
 * quatre choix qui rendent l'ensemble « v3 » plutôt que « legacy repeint » y
 * sont énoncés une fois.
 *
 * Ce qui reste ici ne sert qu'à l'accueil : le héros, la grille des atouts, le
 * bloc de mission et l'appel final.
 *
 * Aucune COULEUR n'est écrite (§ 3.2 corollaire 2 : la seconde table de jetons
 * est interdite), et l'ESPACEMENT est en pixels littéraux — il n'existe aucun
 * jeton `--space-*` dans la table servie, et en inventer un ici FABRIQUERAIT
 * cette seconde table.
 */
export const FEUILLE_DE_LA_VITRINE = compacte(`
.heros{padding:64px 0 8px;max-width:720px}
.badge{display:inline-block;margin:0 0 20px;padding:6px 14px;border-radius:var(--radius-pill);font-size:var(--text-xs);font-weight:var(--font-weight-medium);letter-spacing:.02em;color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 12%,transparent)}
.heros h1{margin:0 0 18px;font-size:var(--text-4xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.heros h1 em{font-style:normal;color:var(--color-primary)}
.accroche{margin:0;font-size:var(--text-md);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
nav.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}

.atouts{margin-top:72px}
.atouts .sous{margin:0 0 26px;color:var(--color-text-muted);line-height:var(--leading-relaxed)}
.atouts ul{display:grid;gap:14px;margin:0;padding:0;list-style:none;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.atouts li{border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);padding:20px;background:var(--color-surface)}
.atouts h3{margin:0 0 8px;font-size:var(--text-base);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
.atouts p{margin:0;font-size:var(--text-sm);line-height:var(--leading-relaxed);color:var(--color-text-muted)}

.mission{margin-top:72px;border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);background:var(--color-surface);padding:28px}
.mission p{margin:0;line-height:var(--leading-relaxed);color:var(--color-text-muted);max-width:64ch}
.mission .devise{margin-top:18px;color:var(--color-primary);font-weight:var(--font-weight-medium);font-size:var(--text-sm);letter-spacing:.06em;text-transform:uppercase}

.appel{margin-top:72px;text-align:center}
.appel p{margin:0 auto 26px;max-width:52ch;color:var(--color-text-muted);line-height:var(--leading-relaxed)}
`);
