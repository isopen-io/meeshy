import { nextFocusIndex } from '@/lib/view/focus-trap';

/**
 * **LE FOCUS D'UN TIROIR MODAL** (#8876) — un tiroir `aria-modal` qui ne déplace, ne retient ni ne
 * rend le focus laisse le clavier et le lecteur d'écran DERRIÈRE la couche : on tabule dans une page
 * qu'on ne voit plus, et on ne sait pas où l'on atterrit en la fermant. Les lois sont ici ; le DOM
 * (le tiroir, son déclencheur) reste à l'appelant.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusablesIn = (root: ParentNode): readonly HTMLElement[] => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];

/**
 * Où va `Tab` (ou `Maj+Tab`) dans le tiroir : le suivant, en BOUCLE — du dernier au premier, du premier
 * au dernier. Un focus tombé hors du tiroir (un clic sur le voile) y est ramené, sur le premier
 * élément (sur le dernier en arrière). `null` : rien à focaliser, la touche suit son cours.
 */
export function trappedTabTarget(root: ParentNode, active: Element | null, backwards: boolean): HTMLElement | null {
  const items = focusablesIn(root);
  if (items.length === 0) return null;
  const current = items.findIndex((item) => item === active);
  if (current === -1) return items[backwards ? items.length - 1 : 0] ?? null;
  return items[nextFocusIndex(items.length, current, backwards)] ?? null;
}

/**
 * SUIVRE UN LIEN du tiroir change d'écran : le focus ne revient pas au bouton de menu (il n'existe
 * plus, ou n'est plus le propos), il va au TITRE de l'écran d'arrivée — c'est ce qu'une navigation
 * annonce. L'écran d'arrivée est monté après le tiroir (il peut même charger son code) : la demande
 * vit un court instant, et c'est le cadre qui la reçoit à son montage.
 */
const HEADING_REQUEST_WINDOW_MS = 3000;

let headingRequestedAt: number | null = null;

export function requestMainHeadingFocus(now: number = Date.now()): void {
  headingRequestedAt = now;
}

export function takeMainHeadingFocusRequest(now: number = Date.now()): boolean {
  const fresh = headingRequestedAt !== null && now - headingRequestedAt < HEADING_REQUEST_WINDOW_MS;
  headingRequestedAt = null;
  return fresh;
}

/** Le `<h1>` de l'écran — dans l'en-tête ou dans le contenu selon l'écran — sinon la zone de contenu. */
export function focusMainHeading(doc: Document = document): boolean {
  const target = doc.querySelector<HTMLElement>('[data-admin-shell] h1') ?? doc.getElementById('contenu');
  if (target === null || !target.isConnected) return false;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
  return true;
}
