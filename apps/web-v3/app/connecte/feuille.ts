import { compacte } from '@/app/enveloppe/feuille';

/**
 * La feuille de la zone CONNECTÉE — le tableau de bord et la liste des
 * conversations, qui partagent une grille de cartes et une liste à filets.
 *
 * Ce qui la rend « v3 » est ce qui rend la vitrine v3 : un accent unique, des
 * cartes à filet fin sur `--color-surface` sans ombre portée, la hiérarchie des
 * jetons `--text-*`, et les libellés qui QUALIFIENT en petites capitales
 * espacées. La différence avec les pages institutionnelles tient à une chose :
 * ici, les cartes portent des CHIFFRES, donc la valeur domine et son libellé
 * s'efface.
 *
 * `.hors-ecran` porte le mot qui MANQUE à l'œil. La pastille de non-lus est un
 * nombre nu : à l'œil, le contexte le dit ; à la voix, « 3 » ne dit rien. Elle
 * n'est pas cachée par `display:none`, qui la retirerait aussi de la voix — le
 * découpage la sort du flux en la laissant lisible.
 *
 * Aucune COULEUR écrite (§ 3.2 corollaire 2) ; espacement en pixels littéraux,
 * la table servie ne portant aucun jeton `--space-*`.
 */
export const FEUILLE_CONNECTEE = compacte(`
.bonjour{padding:48px 0 8px}
.bonjour h1{margin:0 0 10px;font-size:var(--text-3xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.bonjour p{margin:0;color:var(--color-text-muted);line-height:var(--leading-relaxed)}

.chiffres{display:grid;gap:14px;margin:32px 0 0;padding:0;list-style:none;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.chiffres li{border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);padding:20px;background:var(--color-surface)}
.chiffres .valeur{display:block;font-size:var(--text-4xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.chiffres .quoi{display:block;margin-top:6px;font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.chiffres .precision{display:block;margin-top:2px;font-size:var(--text-xs);letter-spacing:.06em;text-transform:uppercase;color:var(--color-text-subtle)}

.acces{margin-top:40px}
.acces nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px}

.fil{margin-top:40px}
.fil .tete{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.fil .tete a{font-size:var(--text-sm);color:var(--color-primary)}
.fil ul{margin:16px 0 0;padding:0;list-style:none;border-top:1px solid var(--color-neutral-900)}
.fil li{border-bottom:1px solid var(--color-neutral-900)}
.fil a.ligne{display:flex;align-items:center;gap:14px;padding:16px 4px;min-height:64px;text-decoration:none;color:inherit}
.fil .pastille{flex:none;width:40px;height:40px;border-radius:var(--radius-pill);display:grid;place-items:center;font-size:var(--text-sm);font-weight:var(--font-weight-semibold);background:color-mix(in srgb,var(--color-primary) 16%,transparent);color:var(--color-primary)}
.fil .corps{flex:1;min-width:0}
.fil .nom{display:block;font-weight:var(--font-weight-medium);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fil .meta{display:block;margin-top:2px;font-size:var(--text-xs);color:var(--color-text-subtle)}
.fil .compte{flex:none;min-width:24px;height:24px;padding:0 8px;border-radius:var(--radius-pill);display:grid;place-items:center;font-size:var(--text-xs);font-weight:var(--font-weight-semibold);background:var(--color-primary);color:var(--color-on-primary)}
.fil .quand{flex:none;font-size:var(--text-xs);color:var(--color-text-subtle)}

.hors-ecran{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

.vide{margin-top:32px;border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);background:var(--color-surface);padding:32px;text-align:center}
.vide h2{margin:0 0 8px;font-size:var(--text-lg);font-weight:var(--font-weight-semibold)}
.vide p{margin:0 auto 22px;max-width:44ch;color:var(--color-text-muted);line-height:var(--leading-relaxed)}
`);
