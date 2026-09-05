/**
 * La feuille des DEUX écrans de `/l/:token` — l'ouverture du lien et le lien
 * clos —, et la raison pour laquelle il n'y en a qu'une.
 *
 * Les deux surfaces rendent le MÊME gabarit (planche `MeeshyWebV3.dc.html:19-24`
 * pour l'en-tête, `:385-399` pour le bloc central) : pastille de 76 px, glyphe
 * de 34 px, gouttière de 14 px, carte de contexte à 4/14 px, bouton principal de
 * 56 px et secondaire de 52 px. C'est ce que la conformité recouvre —
 * disposition, hiérarchie, états, gestes.
 *
 * Elles ne se ressemblent pas : elles sont le même écran dans deux états. Une
 * seconde feuille — un module CSS pour la page, cette chaîne pour le document —
 * aurait été la jumelle qui dérive au premier pixel corrigé d'un seul côté. Le
 * gestionnaire de route ne peut PAS consommer un module CSS (il compose son
 * document à la main, sans layout et sans pipeline) : c'est donc la forme
 * CHAÎNE qui gagne, et la page l'inline dans son propre document.
 *
 * DEUX MORCEAUX, PARCE QUE DEUX HÔTES. `SOCLE_DU_DOCUMENT` remet ce que
 * `app/globals.css` pose déjà pour toute PAGE — remise à zéro, corps, anneau de
 * focus — et n'est servi qu'au document autoporteur du gestionnaire de route,
 * qui ne passe par aucun layout. `FEUILLE_DE_L_ECRAN` est l'écran lui-même, et
 * les deux hôtes le partagent.
 *
 * Ce qu'elle ne reprend PAS, et c'est l'écart assumé de la mission : les
 * VALEURS de police et de rayon. La planche écrit `700 24px` et `18px` ; le
 * design system porte `--font-weight-semibold`, `--text-2xl` et `--radius-xl`,
 * et c'est lui qui gagne. Aucune couleur, aucun rayon, aucune graisse n'est
 * écrit ici : tout vient de `packages/design-tokens` — la seule écriture que le
 * corollaire 2 du § 3.2 autorise, gardée par `scripts/check-jetons.mjs`.
 *
 * Elle est compacte parce qu'elle est PESÉE : le § 8.3 borne le document de la
 * redirection — jetons compris — à 4 Ko gzip.
 *
 * LE CONTOUR D'UN BOUTON FANTÔME N'EST PAS UN SÉPARATEUR
 *
 * `.secondaire` n'a aucun fond : sa BORDURE porte, à elle seule, l'information
 * « il y a un contrôle ici », et WCAG 1.4.11 lui demande 3:1 contre le plan qui
 * la porte. `--color-border` ne l'atteint dans aucun des deux schémas — 1,62:1
 * en sombre, 1,27:1 en CLAIR, le pire des deux —, et `packages/design-tokens`
 * le DIT à l'endroit exact où il définit ce jeton : « ce sont des séparateurs,
 * pas des contours ». Le jeton du rôle est `--color-border-interactive` (4,46:1
 * sombre, 3,76:1 clair), défini deux lignes plus bas dans les deux fichiers de
 * thème, et déjà gardé par `scripts/check-jetons.mjs` (`SIGNAUX_SUR_PLAN`).
 *
 * Ce que le gate de jetons ne pouvait PAS attraper : il mesure la valeur d'un
 * jeton, jamais le jeton qu'un écran CHOISIT — et une feuille ne sait pas dire
 * lequel de ses sélecteurs est un contrôle. C'est le DOM qui le sait, par la
 * balise et le rôle : le contour de chaque contrôle est donc mesuré au
 * navigateur, dans les quatre colonnes de thème
 * (`e2e/visual/lib/contours.ts`, consommé par `v3-lien-expire.spec.ts`).
 */

const compacte = (feuille: string): string => feuille.replace(/\s*\n\s*/g, '').trim();


export const FEUILLE_DE_L_ECRAN = compacte(`
.cadre{max-width:430px;min-height:100vh;margin:0 auto}
.chrome{display:flex;align-items:center;gap:12px;padding:20px 16px 12px}
.retour{display:flex;padding:4px;color:var(--color-primary);text-decoration:none}
.retour svg{width:26px;height:26px}
.chrome p{margin:0}
.chrome .titre{font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.01em}
.chrome .sous{color:var(--color-text-subtle);font-size:var(--text-xs)}
main{display:flex;flex-direction:column;align-items:center;gap:14px;padding:40px 26px;text-align:center}
.pastille{display:flex;align-items:center;justify-content:center;width:76px;height:76px;border-radius:var(--radius-pill);background:color-mix(in srgb,var(--color-primary) 14%,transparent)}
.pastille svg{width:34px;height:34px;color:var(--color-primary)}
.pastille.alerte{background:color-mix(in srgb,var(--color-danger) 14%,transparent)}
.pastille.alerte svg{color:var(--color-danger)}
h1{margin:0;font-size:var(--text-2xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
.corps{margin:0;max-width:290px;color:var(--color-neutral-400);line-height:var(--leading-relaxed)}
dl{width:100%;margin:4px 0 0;padding:4px 14px;text-align:left;background:var(--color-surface);border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg)}
dl div{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-neutral-900);font-size:var(--text-xs)}
dl div:last-child{border-bottom:0}
dt{color:var(--color-text-muted)}
dd{margin:0;text-align:right;font-weight:var(--font-weight-medium)}
nav{display:flex;flex-direction:column;gap:14px;width:100%;margin-top:8px}
.cta{display:flex;align-items:center;justify-content:center;text-decoration:none;font-weight:var(--font-weight-semibold);border-radius:var(--radius-xl)}
.principal{height:56px;font-size:var(--text-md);background:var(--color-primary);color:var(--color-on-primary)}
.secondaire{height:52px;color:var(--color-text);border:1px solid var(--color-border-interactive)}
`);
