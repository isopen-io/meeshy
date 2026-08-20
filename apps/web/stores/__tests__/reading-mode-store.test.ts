/**
 * Le contrat PUBLIC de `reading-mode-store`, inchangé — vérifié APRÈS que ce
 * module soit devenu une façade au-dessus du magasin du contrat (REV-4bis/B2).
 * C'est tout l'intérêt de laisser ce fichier tel quel : ses assertions n'ont
 * pas bougé d'un caractère, seule la remise à zéro a changé d'adresse, parce
 * que la façade n'a plus d'état à remettre à zéro. Un comportement identique
 * prouvé par des témoins écrits AVANT le changement vaut mieux qu'un témoin
 * réécrit après.
 *
 * L'architecture de la façade, elle, est prouvée par
 * `__tests__/lentille/reading-mode-facade.test.ts` (aller-retour croisé,
 * migration, absence de seconde persistance).
 */
import { DEFAULT_READING_MODE, READING_MODES, isReadingMode } from '@/lib/conversations/reading-mode';
import { useReadingModeStore } from '../reading-mode-store';
import { useReadingModePreferenceStore } from '../reading-mode-preference-store';

const CONVERSATION_A = '507f1f77bcf86cd799439021';
const CONVERSATION_B = '507f1f77bcf86cd799439022';

beforeEach(() => {
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
});

describe('reading mode — le verdict des modes', () => {
  it('keeps exactly the lenses the verdict retained', () => {
    expect(READING_MODES).toEqual(['focal', 'script', 'bubble']);
  });

  // Décision produit 2026-08-20 : « Il faut que le mode bulle soit le mode
  // par défaut ! » — aligne le chemin drapeau éteint (celui que les
  // utilisateurs voient réellement) sur le défaut déjà en vigueur drapeau
  // allumé depuis le 2026-08-17/18.
  it('opens on Bubble by default', () => {
    expect(DEFAULT_READING_MODE).toBe('bubble');
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('bubble');
  });

  it('rejects anything outside the retained lenses', () => {
    expect(isReadingMode('focal')).toBe(true);
    expect(isReadingMode('riviere')).toBe(false);
    expect(isReadingMode(undefined)).toBe(false);
  });
});

describe('reading mode — le choix est collant, par conversation', () => {
  it('remembers a manual choice for that conversation only', () => {
    useReadingModeStore.getState().setMode(CONVERSATION_A, 'script');

    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('script');
    expect(useReadingModeStore.getState().getMode(CONVERSATION_B)).toBe('bubble');
  });

  // Le bouton `Aa` du volume 4 : une bascule densité, réversible d'un geste.
  // Départ EXPLICITE en Focal — le défaut ambiant est désormais Bulles
  // (2026-08-20), et `nextDensity('bubble')` rentre par Focal (cf. le témoin
  // dédié juste en dessous), pas par Script : fixer le point de départ rend
  // ce témoin indépendant de ce que vaut le défaut.
  it('toggles between Focal and Script density without touching other lenses', () => {
    const { setMode, toggleDensity } = useReadingModeStore.getState();
    setMode(CONVERSATION_A, 'focal');

    toggleDensity(CONVERSATION_A);
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('script');

    toggleDensity(CONVERSATION_A);
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('focal');
  });

  // Depuis la vue bulles héritée, `Aa` doit ramener dans les rangées plates
  // plutôt que de laisser l'utilisateur coincé hors des deux densités.
  it('brings the legacy bubble view back into the flat densities', () => {
    useReadingModeStore.getState().setMode(CONVERSATION_A, 'bubble');

    useReadingModeStore.getState().toggleDensity(CONVERSATION_A);

    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('focal');
  });
});
