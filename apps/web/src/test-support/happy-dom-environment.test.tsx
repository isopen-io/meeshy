import { describe, expect, test } from 'bun:test';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from './happy-dom-environment';

describe('l’environnement happy-dom des tests', () => {
  test('un lien target="_blank" cliqué n’ouvre aucune page enfant — aucun fetch réel ne part après les tests', () => {
    ensureHappyDomRegistered();
    const settings = (globalThis.window as unknown as { happyDOM: { settings: { navigation: { disableChildPageNavigation: boolean } } } })
      .happyDOM.settings;
    expect(settings.navigation.disableChildPageNavigation).toBe(true);
  });

  test('libérer le DOM laisse d’abord React vider son travail planifié — aucun rappel ne retombe sur un `window` disparu', async () => {
    ensureHappyDomRegistered();
    const effects: string[] = [];
    const Probe = () => {
      useEffect(() => {
        effects.push('effet');
      });
      return <div>sonde</div>;
    };
    createRoot(document.body.appendChild(document.createElement('div'))).render(<Probe />);

    await releaseHappyDomIfRegistered();

    expect(effects).toEqual(['effet']);
  });

  test('une libération non attendue ne démonte pas le DOM que le fichier suivant vient de réclamer', async () => {
    ensureHappyDomRegistered();
    const pending = releaseHappyDomIfRegistered();
    ensureHappyDomRegistered();

    await pending;

    expect(typeof globalThis.document?.createElement).toBe('function');
    await releaseHappyDomIfRegistered();
  });
});
