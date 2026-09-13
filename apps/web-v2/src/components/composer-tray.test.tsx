import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { MIN_SENDABLE_DURATION_MS, type RecorderState } from '@/lib/view/use-recorder';

import ComposerTray from './composer-tray';

/**
 * LA BARRE D'ENREGISTREMENT (revue-correction #5668) — elle n'avait AUCUN
 * témoin : `composer.test.tsx` ne l'atteint pas (le micro y refuse toujours)
 * et `use-recorder.test.tsx` teste le HOOK, jamais la vue. Ses trois boutons
 * — annuler, arrêter-et-joindre, envoyer — étaient donc du code que rien ne
 * mesurait, alors que ce sont eux qui portent le SEUIL de 0,5 s.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const stateOf = (durationMs: number): RecorderState => ({ status: 'recording', durationMs, levels: [0.2, 0.6] });

function mountBar(durationMs: number, gestures: { cancel?: () => void; stop?: () => void; send?: () => void } = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ComposerTray
        variant="recording-bar"
        recorderState={stateOf(durationMs)}
        onCancelRecording={gestures.cancel ?? (() => {})}
        onStopToTray={gestures.stop ?? (() => {})}
        onSendRecording={gestures.send ?? (() => {})}
      />,
    );
  });
  return container;
}

describe('RecordingBar — le seuil de 0,5 s (#5668, revue-correction)', () => {
  /**
   * MIROIR EXACT d'iOS : `guard canSend else { HapticFeedback.error(); return }`
   * (`UniversalComposerBar+Recording.swift:212-216`, `:245-249`) —
   * l'enregistrement CONTINUE. La version livrée appelait les gestes, dont le
   * hook rend `null` sous le seuil : le tap DÉTRUISAIT l'enregistrement.
   */
  test('sous le seuil, « arrêter » et « envoyer » ne font RIEN (l’enregistrement n’est pas détruit)', () => {
    let stops = 0;
    let sends = 0;
    const el = mountBar(MIN_SENDABLE_DURATION_MS - 1, { stop: () => (stops += 1), send: () => (sends += 1) });

    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Arrêter et ajouter aux pièces jointes"]')!.click();
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer le message vocal"]')!.click();
    });

    expect(stops).toBe(0);
    expect(sends).toBe(0);
    expect(el.querySelector('[aria-label="Envoyer le message vocal"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(el.querySelector('[aria-label="Envoyer le message vocal"]')?.getAttribute('title')).toContain(
      'Maintenez encore',
    );
  });

  test('au-dessus du seuil, les deux gestes partent, et « annuler » part TOUJOURS', () => {
    let stops = 0;
    let sends = 0;
    let cancels = 0;
    const el = mountBar(MIN_SENDABLE_DURATION_MS, {
      stop: () => (stops += 1),
      send: () => (sends += 1),
      cancel: () => (cancels += 1),
    });

    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Arrêter et ajouter aux pièces jointes"]')!.click();
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer le message vocal"]')!.click();
      el.querySelector<HTMLButtonElement>('[aria-label="Annuler l’enregistrement"]')!.click();
    });

    expect(stops).toBe(1);
    expect(sends).toBe(1);
    expect(cancels).toBe(1);
    expect(el.querySelector('[aria-label="Envoyer le message vocal"]')?.hasAttribute('aria-disabled')).toBe(false);
  });

  /**
   * `aria-label` sur le groupe du minuteur REMPLAÇAIT son contenu : le lecteur
   * d'écran disait « Enregistrement en cours » et JAMAIS la durée — la seule
   * information que cette bande porte. iOS sert les deux
   * (`accessibilityLabel` + `accessibilityValue`, `:206-209`).
   */
  test('la durée est ÉCRITE pour l’œil (`1:05`) ET PRONONÇABLE pour le lecteur d’écran (`1 min 5 s`)', () => {
    const el = mountBar(65_000);
    const timer = el.querySelector('[role="timer"]')!;
    expect(timer.textContent).toContain('1:05');
    expect(timer.textContent).toContain('1 min 5 s');
    // Rien ne doit MASQUER ce contenu par un nom accessible calculé ailleurs.
    expect(timer.hasAttribute('aria-label')).toBe(false);
  });
});

describe('ComposerTray — la bande d’avertissement (#5668, revue-correction)', () => {
  const mountNotice = (notice: { message: string; onRetry?: () => void; onDismiss: () => void }) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<ComposerTray variant="above" pending={[]} onRemove={() => {}} notice={notice} />);
    });
    return container;
  };

  test('« Fermer » existe TOUJOURS ; « Réessayer » seulement quand le geste se rejoue', () => {
    let dismissed = 0;
    const el = mountNotice({ message: 'Micro indisponible sur ce navigateur', onDismiss: () => (dismissed += 1) });

    expect(el.textContent).not.toContain('Réessayer');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Fermer l’avertissement"]')!.click();
    });
    expect(dismissed).toBe(1);
  });

  test('la bande est annoncée sans voler le focus (`role="status"`)', () => {
    const el = mountNotice({ message: 'Micro refusé', onRetry: () => {}, onDismiss: () => {} });
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.textContent).toContain('Réessayer');
  });
});
