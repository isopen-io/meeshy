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

/**
 * LES ÉTATS D'UNE RANGÉE (#7580, règle porteur du 2026-09-23).
 *
 * La vue unique a DEUX états à elle, et plus aucun ne dit « supprimé » :
 * - `viewOnce` — pas encore ouverte PAR MOI : une seule puce,
 *   « (1) · Touchez pour afficher », et rien du contenu ;
 * - `opened` — déjà ouverte par moi (auteur compris) : la même puce, fond
 *   atténué, « (1) · Déjà ouvert ». PERMANENTE : elle ne part qu'à l'échéance
 *   d'un éphémère ou par une suppression explicite.
 *
 * `veiled` ne désigne plus que le FLOU : la ligne floutée, révélée au toucher.
 */
export type ProtectionKind = 'standard' | 'veiled' | 'viewOnce' | 'opened' | 'deleted' | 'expired';

/** `BubbleBlurRevealLifecycle.swift:23` — gardé par `check-curve.mjs` PARTIE 5. */
export const REVEAL_DURATION_SECONDS = 5;

/** `FocalProtectedContent.swift:33` (la bulle iOS dit 20, BSL:972 — divergence documentée D-23). */
export const BLUR_RADIUS_PX = 18;

/** Durée d'affichage de la légende d'échec de révélation (D-23 §1.4 point 8). */
export const REVEAL_ERROR_NOTICE_MS = 2500;

/**
 * `consumedByMe` — le contrat serveur de #7578 : la consommation est PAR
 * PERSONNE. Tant que la passerelle ne le sert pas, `viewOnceCount > 0` reste
 * la seule trace (l'ancien compteur global) : c'est un repli, jamais une
 * seconde règle.
 */
export type ViewOnceConsumptionFields = Pick<Message, 'isViewOnce' | 'viewOnceCount'> & {
  readonly consumedByMe?: boolean;
};

export function viewOnceOpenedByMe(message: ViewOnceConsumptionFields): boolean {
  if (!message.isViewOnce) return false;
  if (typeof message.consumedByMe === 'boolean') return message.consumedByMe;
  return (message.viewOnceCount ?? 0) > 0;
}

type ProtectionFields = Pick<Message, 'deletedAt' | 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'expiresAt'> & {
  readonly consumedByMe?: boolean;
  readonly ephemeralDuration?: number;
};

/** Un message dont la DURÉE d'éphémère est posée — le seul qui a le droit de partir à l'échéance. */
function isEphemeral(message: Pick<ProtectionFields, 'ephemeralDuration'>): boolean {
  const duration = message.ephemeralDuration;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
}

/**
 * L'ORDRE : supprimé gagne sur tout ; puis l'échéance d'un ÉPHÉMÈRE ; puis la
 * vue unique (déjà ouverte par moi, sinon à ouvrir) ; puis le flou ; sinon
 * standard.
 *
 * L'échéance d'une vue unique qui n'est PAS éphémère (le balayage serveur,
 * #7578) ne retire rien : pour qui la lit, elle est « déjà ouverte », et le
 * reste (#7580, précision porteur : « ni le balayage serveur, ni une sortie de
 * conversation, ni un redémarrage ne la retirent »).
 */
export function protectionOf(message: ProtectionFields, now: number): ProtectionKind {
  // Second verrou (défaut 4, revue #5668) : `!= null` plutôt que
  // `!== undefined` — fail-closed même si une charge NON décodée atteint
  // malgré tout cette loi.
  if (message.deletedAt != null) return 'deleted';
  const pastDeadline = message.expiresAt != null && new Date(message.expiresAt).getTime() <= now;
  if (message.isViewOnce) {
    if (pastDeadline && isEphemeral(message)) return 'expired';
    if (pastDeadline || viewOnceOpenedByMe(message)) return 'opened';
    return 'viewOnce';
  }
  if (pastDeadline) return 'expired';
  if (message.isBlurred) return 'veiled';
  return 'standard';
}

/** Les deux états de la vue unique — ceux que la PUCE porte. */
export function isViewOnceKind(kind: ProtectionKind): kind is 'viewOnce' | 'opened' {
  return kind === 'viewOnce' || kind === 'opened';
}

/**
 * `ephemeralOf` A ÉTÉ RETIRÉE AU LOT #7454 — elle lisait `expiresAt` et
 * répondait « reste-t-il du temps ? » depuis lui seul. Un éphémère n'a plus
 * d'`expiresAt` sur `message:new` (contrat du fil #7451, point 4) : ce que le
 * lecteur voit se compose de son échéance SERVIE et de sa RÉCEPTION locale,
 * par `ephemeralDeadline()` (`@meeshy/shared/utils/ephemeral-deadline`) et
 * `resolveEphemeralDeadline()` (`lib/view/ephemeral-reception.ts`).
 *
 * `formatRemaining` reste ICI : c'est une écriture, pas une décision, et le
 * chrome de protection la consomme telle quelle.
 */

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

/**
 * LE COMPTEUR DE LA DERNIÈRE MINUTE — `0:59 → 0:00`, la forme que le porteur
 * écrit (#7468). DISTINCT de `formatRemaining` ci-dessus, et les deux sont
 * justes : celui-ci s'adresse à l'ŒIL, dans une puce où deux chiffres qui
 * défilent se lisent d'un coup ; l'autre s'adresse à l'OREILLE, où « 0:45 » se
 * prononce mal et où « 45s » se comprend seul.
 *
 * C'est la raison pour laquelle le libellé accessible ne recopie PAS ce qui est
 * peint : ils ne disent pas la même chose au même public.
 */
export function countdownDigits(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
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
 * rend l'entrée INCHANGÉE — aucune affordance pendant la fenêtre, et une vue
 * unique ouverte ne se rouvre plus.
 */
export function reveal(phase: RevealPhase, input: { readonly now: number }): RevealPhase {
  if (phase.phase !== 'hidden') return phase;
  return { phase: 'revealed', until: input.now + REVEAL_DURATION_SECONDS * 1000 };
}

/**
 * L'OUVERTURE D'UNE VUE UNIQUE (#7580) — SANS horloge : elle reste ouverte
 * jusqu'à ce que le lecteur la referme (un second toucher, la sortie de
 * l'écran au défilement, ou la fermeture du plein écran d'un média).
 * `until` infini : `settle` ne la referme donc jamais seule.
 */
export function openViewOnce(phase: RevealPhase): RevealPhase {
  if (phase.phase !== 'hidden') return phase;
  return { phase: 'revealed', until: Number.POSITIVE_INFINITY };
}

/**
 * LA FERMETURE D'UNE VUE UNIQUE — `revealed → fogging(→ consumed)` : le
 * brouillard joue, puis la puce « Déjà ouvert » prend la place. `immediate`
 * (le plein écran d'un média qu'on ferme) passe directement à `consumed` :
 * le brouillard n'a rien à couvrir, le contenu n'était pas dans la rangée.
 */
export function closeViewOnce(
  phase: RevealPhase,
  input: { readonly now: number; readonly immediate?: boolean },
): RevealPhase {
  if (phase.phase !== 'revealed') return phase;
  if (input.immediate === true) return { phase: 'consumed' };
  return { phase: 'fogging', until: input.now + FOG_DURATION_MS, next: 'consumed' };
}

/**
 * LE PREMIER PAS HORS DE `revealed` : la fenêtre s'éteint à `until` et
 * entre en `fogging` — le contenu reste monté (`rendersContent` le couvre),
 * le brouillard couvre l'écran en `FOG_DURATION_MS`, PUIS `settleFog`
 * achève le passage vers `hidden` (flou) ou `consumed` (vue unique).
 */
export function settle(phase: RevealPhase, input: { readonly now: number; readonly isViewOnce: boolean }): RevealPhase {
  if (phase.phase !== 'revealed') return phase;
  if (input.now < phase.until) return phase;
  return { phase: 'fogging', until: input.now + FOG_DURATION_MS, next: input.isViewOnce ? 'consumed' : 'hidden' };
}

/** LE SECOND PAS : le brouillard achève sa fermeture, rend la main au voile ou à la puce « Déjà ouvert ». */
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
 * PAR-DESSUS) — c'est `settleFog` qui démonte. `opened` rend le contenu
 * pendant la fenêtre LOCALE : la consommation bascule le message en `opened`
 * dès le toucher, et c'est l'état local, jamais le `kind` du dernier rendu,
 * qui dit si le lecteur est en train de le lire.
 */
export function rendersContent(kind: ProtectionKind, phase: RevealPhase): boolean {
  if (kind === 'standard') return true;
  if (kind === 'veiled' || kind === 'viewOnce' || kind === 'opened') {
    return phase.phase === 'revealed' || phase.phase === 'fogging';
  }
  return false;
}

/** L'affordance (la ligne floutée, ou la puce « Touchez pour afficher ») ne monte QUE sur un état à ouvrir, au repos. */
export function showsAffordance(kind: ProtectionKind, phase: RevealPhase): boolean {
  return (kind === 'veiled' || kind === 'viewOnce') && phase.phase === 'hidden';
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
