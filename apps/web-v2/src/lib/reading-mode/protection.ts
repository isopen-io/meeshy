import type { Message } from '@/lib/api/types';

/**
 * LA LOI DE PROTECTION D'UN MESSAGE — miroir de `BubbleContentBuilder.Kind`
 * (`apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift:42-60`)
 * et du cycle de révélation `BubbleBlurRevealLifecycle`
 * (`.../BubbleBlurRevealLifecycle.swift:8-31,56-107`) — D-23, issue #5676.
 *
 * CE FICHIER EST LE SEUL DOMICILE DU CYCLE DE RÉVÉLATION : écrire une seconde
 * horloge de révélation dans une peau (`focal-row.tsx`, `bubble.tsx`) est le
 * défaut que D-14 interdit pour le Prisme, rejoué ici pour la protection —
 * une seule loi, deux hôtes qui la CONSOMMENT, jamais qui la réécrivent.
 *
 * CE QUI EST REPRIS TEL QUEL D'iOS : l'ordre du dispatch (supprimé > brûlé >
 * expiré > voilé > standard), la durée de révélation (5 s), la consommation
 * SERVEUR avant révélation d'une vue unique, « une vue unique révélée une
 * fois ne se révèle plus ».
 *
 * CE QUI EST ADAPTÉ, et pourquoi (D-23 §1.4) :
 * 1. `isViewOnce` SANS `isBlurred` est voilé ici (forme SDK
 *    `declaredProtection`, fail-closed) — Focal iOS ne voile QUE sur
 *    `isBlurred` (`FocalRow.swift:284`), ce que la spécification documente
 *    comme une divergence assumée (dimension 1, sécurité, prime sur la
 *    fidélité pixel).
 * 2. Un seul rayon de flou, 18 (Focal iOS ; la bulle iOS en porte 20,
 *    `BubbleStandardLayout.swift:972` — deux rayons sur un seul composant
 *    seraient une cote sans raison).
 */

export type ProtectionKind = 'standard' | 'veiled' | 'burned' | 'deleted' | 'expired';

/** `BubbleBlurRevealLifecycle.swift:23` — gardé par `check-curve.mjs` PARTIE 5. */
export const REVEAL_DURATION_SECONDS = 5;

/** `FocalProtectedContent.swift:33` (la bulle iOS dit 20, BSL:972 — divergence documentée D-23). */
export const BLUR_RADIUS_PX = 18;

/** Durée d'affichage de la légende d'échec de révélation (D-23 §1.4 point 8). */
export const REVEAL_ERROR_NOTICE_MS = 2500;

type ProtectionFields = Pick<Message, 'deletedAt' | 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'expiresAt'>;

/**
 * L'ORDRE, exactement celui de `BubbleContentBuilder.swift:52-60` :
 * supprimé gagne sur tout, puis brûlé (vue unique déjà consommée), puis
 * expiré (éphémère échu), puis voilé (flou ou vue unique non consommée),
 * sinon standard. `messageSource === 'system'` n'a pas de rangée web
 * aujourd'hui — un message système protégé rendrait un tombstone, ce qui
 * est fail-closed et n'a donc pas besoin d'être exclu ici.
 */
export function protectionOf(message: ProtectionFields, now: number): ProtectionKind {
  // Second verrou (défaut 4, revue #5668) : `!= null` plutôt que
  // `!== undefined` — fail-closed même si une charge NON décodée (un
  // `null` explicite de la passerelle, jamais retiré par `decodeMessage`)
  // atteint malgré tout cette loi. `decodeMessage` reste le site qui
  // retire la clé ; ce garde est une redondance délibérée, pas un
  // remplacement.
  if (message.deletedAt != null) return 'deleted';
  if (message.isViewOnce && message.viewOnceCount > 0) return 'burned';
  if (message.expiresAt != null && new Date(message.expiresAt).getTime() <= now) return 'expired';
  // Forme SDK `declaredProtection` (`MessageModels.swift:178-191`) : voilé
  // dès que l'un OU l'autre est vrai — jamais `isBlurred` seul.
  if (message.isBlurred || message.isViewOnce) return 'veiled';
  return 'standard';
}

export type EphemeralState =
  | { readonly state: 'none' }
  | { readonly state: 'running'; readonly remainingSeconds: number }
  | { readonly state: 'expired' };

/** Miroir de `BubbleEphemeralLifecycle.State.evaluate` (:8-20). */
export function ephemeralOf(expiresAt: Date | string | undefined, now: number): EphemeralState {
  if (expiresAt === undefined) return { state: 'none' };
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return { state: 'expired' };
  return { state: 'running', remainingSeconds: Math.floor(remainingMs / 1000) };
}

/** Miroir de `BubbleEphemeralLifecycle.format` (:25-37). */
export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 10) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

export type RevealPhase =
  | { readonly phase: 'hidden' }
  | { readonly phase: 'revealed'; readonly until: number }
  | { readonly phase: 'fogging'; readonly until: number; readonly next: 'hidden' | 'consumed' }
  | { readonly phase: 'consumed' };

/**
 * Durée de la transition du brouillard — MÊME valeur que la transition
 * `opacity` de `.protected-fog` (`thread-protection.css`). iOS porte TROIS
 * phases après les 5 s (fogIn 0,4 s → re-flou 0,4 s → fogOut 0,5 s,
 * `BubbleBlurRevealLifecycle.swift:83-107`) ; D-23 §1.4 point 6 en retient
 * UNE — mais au bon MOMENT : à la FERMETURE, pas à l'ouverture (revue
 * #5676, défaut 5). Le contenu n'a besoin d'aucune explication pour
 * apparaître ; c'est sa disparition — le secret qui se referme sous les
 * yeux — qui porte le sens que l'animation existe pour donner.
 */
export const FOG_DURATION_MS = 400;

/**
 * `hidden → revealed(until)` ; sur `revealed`, `fogging` ou `consumed`,
 * rend l'entrée INCHANGÉE — aucune affordance pendant la fenêtre
 * (`FocalProtectedContent` ne monte le bouton que sur `isMasked`, jamais
 * pendant la révélation ni sa fermeture), et une vue unique consommée ne se
 * révèle plus.
 */
export function reveal(phase: RevealPhase, input: { readonly now: number }): RevealPhase {
  if (phase.phase !== 'hidden') return phase;
  return { phase: 'revealed', until: input.now + REVEAL_DURATION_SECONDS * 1000 };
}

/**
 * LE PREMIER PAS HORS DE `revealed` : la fenêtre s'éteint à `until` et
 * entre en `fogging` — le contenu reste monté (`rendersContent` le couvre),
 * le brouillard couvre l'écran en `FOG_DURATION_MS`, PUIS `settleFog`
 * achève le passage vers `hidden` (voilé ordinaire) ou `consumed` (vue
 * unique — la révélation était la consommation, elle ne se rejoue plus).
 */
export function settle(phase: RevealPhase, input: { readonly now: number; readonly isViewOnce: boolean }): RevealPhase {
  if (phase.phase !== 'revealed') return phase;
  if (input.now < phase.until) return phase;
  return { phase: 'fogging', until: input.now + FOG_DURATION_MS, next: input.isViewOnce ? 'consumed' : 'hidden' };
}

/** LE SECOND PAS : le brouillard achève sa fermeture, rend la main au voile ou au tombstone. */
export function settleFog(phase: RevealPhase, input: { readonly now: number }): RevealPhase {
  if (phase.phase !== 'fogging') return phase;
  if (input.now < phase.until) return phase;
  return phase.next === 'consumed' ? { phase: 'consumed' } : { phase: 'hidden' };
}

/** `RevealRequest.requiresConsume` (`BubbleBlurRevealLifecycle.swift:29`). */
export function requiresConsume(message: Pick<Message, 'isViewOnce'>): boolean {
  return message.isViewOnce;
}

/**
 * La matrice kind × phase — SEULE source du « quand rendre les enfants ».
 * `fogging` REND encore le contenu (le brouillard le couvre progressivement
 * PAR-DESSUS, il ne remplace rien en dessous) — c'est `settleFog` qui
 * démonte, jamais l'arrivée en `fogging`.
 */
export function rendersContent(kind: ProtectionKind, phase: RevealPhase): boolean {
  if (kind === 'standard') return true;
  if (kind === 'veiled') return phase.phase === 'revealed' || phase.phase === 'fogging';
  if (kind === 'burned') return phase.phase === 'revealed' || phase.phase === 'fogging';
  return false;
}

/** L'affordance « Contenu masqué » ne monte QUE sur un voilé au repos. */
export function showsAffordance(kind: ProtectionKind, phase: RevealPhase): boolean {
  return kind === 'veiled' && phase.phase === 'hidden';
}

/**
 * `▇` (U+2587) avance d'environ un cadratin ; une lettre latine moyenne d'un
 * demi. Un substitut d'AUTANT de blocs que le contenu a de caractères occupe
 * donc deux fois sa largeur — mesuré : un message de 32 caractères tenant sur
 * UNE ligne se voilait sur TROIS, et la révélation faisait sauter le fil de
 * deux lignes (revue #5676). Le voile doit occuper la place du contenu, pas
 * davantage : c'est ce qu'iOS obtient gratuitement en floutant le VRAI texte
 * (`BlurRevealModifier`, `BubbleStandardLayout.swift:955-981`), et que le web
 * doit reconstruire puisqu'il ne monte pas ce texte (§1.4 point 1).
 */
const SURROGATE_ADVANCE_RATIO = 2;

/**
 * LE SUBSTITUT — dérivé de la seule LONGUEUR du contenu, jamais de son texte :
 * le vrai texte n'entre PAS dans le DOM avant révélation (D-23 §1.4 point 1).
 * Blocs de `▇` de 3 à 7 caractères séparés d'espaces, occupant à peu près la
 * LARGEUR du contenu (voir `SURROGATE_ADVANCE_RATIO`), par pas de 8 —
 * déterministe : deux appels avec la même longueur rendent la MÊME sortie.
 */
export function surrogateOf(contentLength: number): string {
  const target = Math.max(8, Math.round(contentLength / SURROGATE_ADVANCE_RATIO / 8) * 8);
  const blockSizes: number[] = [];
  let seed = contentLength;
  let total = 0;
  // Une suite déterministe (LCG minimal) génère des blocs de 3 à 7 — la
  // LONGUEUR seule décide, jamais une valeur aléatoire qui bougerait à
  // chaque appel : deux contenus de même longueur rendent le MÊME substitut.
  while (total < target) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const size = 3 + (seed % 5);
    blockSizes.push(size);
    total += size + (blockSizes.length > 1 ? 1 : 0);
  }
  // Le dernier bloc absorbe le dépassement (≤ 7, garanti par la boucle
  // ci-dessus) pour tenir la longueur finale proche de `contentLength`.
  const overflow = total - target;
  if (overflow > 0) {
    const lastIndex = blockSizes.length - 1;
    const shrink = Math.min(overflow, (blockSizes[lastIndex] ?? 1) - 1);
    blockSizes[lastIndex] = (blockSizes[lastIndex] ?? 1) - shrink;
  }
  return blockSizes.map((size) => '▇'.repeat(size)).join(' ');
}
