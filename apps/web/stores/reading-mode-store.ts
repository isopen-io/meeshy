/**
 * Le choix de lentille est COLLANT et stocké par conversation.
 *
 * Règle du volume 3 : l'orchestrateur ne s'exécute qu'à l'ouverture, jamais
 * pendant la lecture — changer de mode sous les yeux de quelqu'un qui lit est
 * la seule faute que ce système ne peut pas se permettre. Un choix manuel
 * (Lentille ou `Aa`) écrit ici et gagne à chaque réouverture.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE FICHIER EST UNE FAÇADE — REV-4bis/B2
 * ═══════════════════════════════════════════════════════════════════════════
 * Il ne DÉTIENT plus rien. Son état vivait dans un `zustand/persist` sous la
 * clé `meeshy-reading-mode` ; il vit désormais dans
 * `stores/reading-mode-preference-store.ts` — le magasin du contrat (WL-106 /
 * LWS-11), versionné, prêt pour le canal serveur `readingMode` de
 * `UserConversationPreferences`. Ce fichier garde son API publique
 * (`useReadingMode`, `setMode`, `toggleDensity`, le sélecteur
 * `useReadingModeStore`) et se contente de TRADUIRE.
 *
 * POURQUOI. Avant ce lot, DEUX magasins mémorisaient « le mode de lecture de
 * cette conversation », avec deux vocabulaires, deux jeux d'écrivains et deux
 * clés — et un seul des deux était lu par le rendu. Choisir un mode dans la
 * liste Lentille ne changeait donc RIEN : une écriture morte. L'arbitrage
 * rendu (REV-4bis, option « façade ») est qu'UN SEUL magasin gouverne, et que
 * ce soit celui que le contrat désigne : lui seul est versionné, lui seul a
 * une suite qui décrit sa réconciliation (`applyReadingModeUpdate`), lui seul
 * survivra à l'arrivée du canal serveur sans changer de forme.
 *
 * C'est LE MÊME arbitrage que REV-3/B2 côté iOS, rendu dans le même sens : le
 * magasin de la liste y est devenu un adaptateur au-dessus du magasin du fil
 * (`LentilleScopedReadingModePreferenceStore`), et ses témoins croisés
 * (`ModePreferenceRoundTripTests` §4 — « écrit d'un côté, relu de l'autre :
 * c'est la définition de "un seul magasin" ») sont l'exact pendant des nôtres.
 *
 * CE QUI NE CHANGE PAS, ET C'EST LA CONTRAINTE DURE : drapeau éteint, le rendu
 * reste bit-à-bit identique — au défaut PRÈS. Le défaut (rien de mémorisé)
 * est `bubble` depuis la décision produit 2026-08-20 (« Il faut que le mode
 * bulle soit le mode par défaut ! », `DEFAULT_READING_MODE`,
 * `lib/conversations/reading-mode.ts` — avant cette date il valait `focal`).
 * Les trois lentilles du sélecteur historique font toujours leur aller-retour
 * — `bubble` compris, ce qui a exigé l'AMENDEMENT S1 (`bulles` au vocabulaire
 * de préférence, cf. `packages/shared/types/reading-modes.ts`) — et la
 * stickiness d'une session à l'autre, que `zustand/persist` offrait
 * gratuitement, est remboursée par `hydrateReadingModePreferencesFromStorage`
 * dans le magasin autoritatif.
 *
 * @see apps/web/stores/reading-mode-preference-store.ts (le magasin, la migration)
 * @see apps/web/lib/conversations/reading-mode.ts (l'unique table de traduction)
 * @see apps/web/hooks/lentille/use-thread-reading-mode.ts (le fil sous drapeau ON)
 */

import {
  DEFAULT_READING_MODE,
  nextDensity,
  preferenceFromReadingMode,
  readingModeFromPreference,
  type ReadingMode,
} from '@/lib/conversations/reading-mode';
import {
  useReadingModePreference,
  useReadingModePreferenceStore,
} from '@/stores/reading-mode-preference-store';

/**
 * L'API publique historique, à l'identique. `setMode`/`toggleDensity` restent
 * SYNCHRONES pour leurs appelants (`ConversationView`,
 * `SharedConversationPreview`) alors que l'écriture sous-jacente est une
 * promesse : le magasin du contrat applique son patch optimiste AVANT son
 * premier `await`, donc un `getMode` immédiat voit déjà la nouvelle valeur —
 * et son propre rollback se charge de l'échec de persistance. Rien à
 * attendre, rien à propager.
 */
interface ReadingModeFacade {
  getMode: (conversationId: string) => ReadingMode;
  setMode: (conversationId: string, mode: ReadingMode) => void;
  toggleDensity: (conversationId: string) => void;
}

const getMode = (conversationId: string): ReadingMode =>
  readingModeFromPreference(
    useReadingModePreferenceStore.getState().getReadingMode(conversationId)
  );

const setMode = (conversationId: string, mode: ReadingMode): void => {
  void useReadingModePreferenceStore
    .getState()
    .setReadingMode(conversationId, preferenceFromReadingMode(mode))
    .catch(() => {
      // Le magasin du contrat a DÉJÀ rétracté son écriture optimiste (et
      // seulement la sienne — identité référentielle). Remonter l'échec ici
      // obligerait chaque appelant à gérer une promesse pour un geste
      // d'interface réversible d'un tap.
    });
};

/**
 * `Aa` — bascule de densité. Lit l'état COURANT plutôt qu'une valeur capturée :
 * deux appuis rapprochés doivent alterner, pas repartir du même point.
 */
const toggleDensity = (conversationId: string): void => {
  setMode(conversationId, nextDensity(getMode(conversationId)));
};

/**
 * Référence STABLE — c'est ce qui permet au sélecteur ci-dessous de ne jamais
 * fabriquer d'objet par rendu (un `state => ({ ... })` reconstruit à chaque
 * notification ferait boucler zustand sur son test d'égalité).
 */
const FACADE: ReadingModeFacade = { getMode, setMode, toggleDensity };

/**
 * Sélecteur compatible avec l'ancien magasin :
 * `useReadingModeStore(state => state.setMode)`. L'abonnement porte sur le
 * magasin AUTORITATIF, de sorte que la façade n'ait aucune souscription
 * propre à tenir ; les appelants n'y sélectionnent que des fonctions (stables),
 * donc ce sélecteur ne provoque jamais de rendu à lui seul — la VALEUR, elle,
 * s'obtient par `useReadingMode` ci-dessous.
 */
export function useReadingModeStore<T>(selector: (state: ReadingModeFacade) => T): T {
  return useReadingModePreferenceStore(() => selector(FACADE));
}

/** `getState()` de l'ancien magasin — même surface, mêmes appelants. */
useReadingModeStore.getState = (): ReadingModeFacade => FACADE;

/**
 * Le mode de lecture d'une conversation, ABONNÉ au magasin autoritatif : un
 * choix fait dans le menu Lentille re-rend désormais le fil ouvert. C'était
 * exactement ce que l'ancien magasin séparé rendait impossible.
 */
export function useReadingMode(conversationId: string | undefined): ReadingMode {
  const preference = useReadingModePreference(conversationId ?? '');
  return conversationId ? readingModeFromPreference(preference) : DEFAULT_READING_MODE;
}
