import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DES CINQ PAGES INSTITUTIONNELLES — une seule, parce qu'elles
 * partagent un seul MODÈLE (`./document.ts`).
 *
 * Ce qu'elle ajoute au chrome, et rien d'autre : l'en-tête de page, les cinq
 * genres de bloc, et la rangée de suite. Tout ce qui entoure — gouttière,
 * marque, titre de section, pied — vient de `app/enveloppe/feuille.ts`, qui le
 * porte aussi pour la vitrine.
 *
 * LA MESURE DE LIGNE EST LE CHOIX CENTRAL. Ces pages sont les seules du site à
 * porter du texte long : une colonne de 1040 px y donnerait des lignes de plus
 * de 140 caractères, illisibles. `max-width:68ch` sur les corps tient la
 * mesure entre 60 et 75 caractères sans figer aucune largeur en pixels — la
 * grille de cartes, elle, garde toute la gouttière.
 *
 * Aucune COULEUR écrite (§ 3.2 corollaire 2), espacement en pixels littéraux :
 * il n'existe aucun jeton `--space-*` dans la table servie, et en inventer un
 * ici fabriquerait la seconde table que ce corollaire interdit.
 */
export const FEUILLE_INSTITUTIONNELLE = compacte(`
.entete{padding:56px 0 8px;max-width:720px}
.entete h1{margin:0 0 14px;font-size:var(--text-4xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.entete .accroche{margin:0;font-size:var(--text-md);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
.entete .mention{margin:18px 0 0;font-size:var(--text-xs);font-weight:var(--font-weight-medium);letter-spacing:.06em;text-transform:uppercase;color:var(--color-text-subtle)}

main>section{margin-top:56px}
main>section>p{margin:0 0 14px;max-width:68ch;line-height:var(--leading-relaxed);color:var(--color-text-muted)}
main>section>p:last-child{margin-bottom:0}

.puces{margin:18px 0 0;padding:0 0 0 22px;max-width:68ch;display:grid;gap:10px}
.puces li{line-height:var(--leading-relaxed);color:var(--color-text-muted)}

.cartes{display:grid;gap:14px;margin:18px 0 0;padding:0;list-style:none;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.cartes>li{border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);padding:20px;background:var(--color-surface)}
.cartes h3{margin:0 0 8px;font-size:var(--text-base);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
.cartes p{margin:0;font-size:var(--text-sm);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
.cartes ul{margin:0;padding:0 0 0 20px;display:grid;gap:8px}
.cartes li li{font-size:var(--text-sm);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
.cartes .mention{margin-top:14px;font-size:var(--text-xs);font-weight:var(--font-weight-medium);letter-spacing:.06em;text-transform:uppercase;color:var(--color-primary)}

.accent{margin:18px 0 0;padding:16px 20px;border-left:2px solid var(--color-primary);max-width:68ch;line-height:var(--leading-relaxed);color:var(--color-text)}

.encadre{margin:18px 0 0;padding:20px;list-style:none;display:grid;gap:8px;border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);background:var(--color-surface);max-width:68ch}
.encadre li{font-size:var(--text-sm);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
.encadre a{color:var(--color-primary)}

.suite nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}
.suite nav a{display:inline-flex;align-items:center;min-height:52px;padding:0 26px;border-radius:var(--radius-xl);font-weight:var(--font-weight-semibold);font-size:var(--text-sm);text-decoration:none;color:var(--color-text);border:1px solid var(--color-border-interactive)}
`);
