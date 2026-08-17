import { DEFAULT_READING_MODE, READING_MODES, isReadingMode } from '@/lib/conversations/reading-mode';
import { useReadingModeStore } from '../reading-mode-store';

const CONVERSATION_A = '507f1f77bcf86cd799439021';
const CONVERSATION_B = '507f1f77bcf86cd799439022';

beforeEach(() => {
  useReadingModeStore.setState({ modes: {} });
});

describe('reading mode — le verdict des modes', () => {
  it('keeps exactly the lenses the verdict retained', () => {
    expect(READING_MODES).toEqual(['focal', 'script', 'bubble']);
  });

  // Vol. 3 : « Focal — Garder. Mode par défaut, successeur direct du fil. »
  it('opens on Focal by default', () => {
    expect(DEFAULT_READING_MODE).toBe('focal');
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('focal');
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
    expect(useReadingModeStore.getState().getMode(CONVERSATION_B)).toBe('focal');
  });

  // Le bouton `Aa` du volume 4 : une bascule densité, réversible d'un geste.
  it('toggles between Focal and Script density without touching other lenses', () => {
    const { toggleDensity } = useReadingModeStore.getState();

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
