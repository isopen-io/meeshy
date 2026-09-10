import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { DEFAULT_USER_PERMISSIONS } from '@meeshy/shared/types/participant';

import { Composer } from './composer';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';

/**
 * LA CITATION PRÉ-ADRESSÉE DIT SA LANGUE (revue #5695) — `replyTo.excerpt`
 * est servi par le PRISME (`served()`, `routes/thread.tsx`), donc il peut
 * être dans une langue AUTRE que celle du document. Le témoin est écrit sur
 * une langue autre que le français (leçon 261 : un témoin de rang ne se
 * pose jamais sur le rang qui rendrait le même verdict par accident).
 */
describe('Composer — la citation porte la langue dans laquelle elle est SERVIE', () => {
  test('replyTo.language pose lang sur l’extrait', () => {
    const html = renderToStaticMarkup(
      <Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Do you confirm the mockup?', language: 'en' }} />,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain('Do you confirm the mockup?');
  });

  test('sans langue servie, aucun lang n’est posé — jamais un « fr » fabriqué', () => {
    const html = renderToStaticMarkup(
      <Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Tu valides la maquette ?' }} />,
    );
    expect(html).not.toContain('lang=');
  });

  test('sans citation, aucun bloc de réponse n’est monté', () => {
    const html = renderToStaticMarkup(<Composer onSend={() => {}} />);
    expect(html).not.toContain('data-composer-reply');
  });
});

/**
 * LE FOCUS APRÈS UN ENVOI AU DOIGT (revue-correction #5813, défaut majeur 8)
 * — SANS ce témoin, le mécanisme (`onPointerDown` + `preventDefault` sur le
 * bouton d'envoi, puis `field.current.focus()` de rattrapage dans `send()`)
 * peut être retiré par un futur diff sans qu'aucun test ne rougisse : c'est
 * exactement la forme « un vert des deux côtés du diff mesure la machine, pas
 * le diff » (`tasks/lessons.md`). `renderToStaticMarkup` ne produit aucun
 * `document` — impossible d'y observer un focus — d'où un DOM RÉEL
 * (happy-dom, enregistré globalement pour ce bloc SEULEMENT) et un rendu
 * CLIENT (`react-dom/client`), jamais un rendu statique.
 *
 * Le second cas protège la coque iOS dans le moteur des tests, en attendant
 * la capture WKWebView (revue-correction #5813, défaut majeur 2) : il épingle
 * que le `click` du bouton d'envoi part bel et bien MALGRÉ le
 * `preventDefault()` posé sur `pointerdown` — la forme exacte qui, dans
 * WKWebView, a par le passé rendu un bouton INERTE quand l'annulation de
 * `pointerdown` supprimait aussi le `click` qui devait le suivre.
 */
describe('Composer — le focus après un envoi au doigt (revue-correction #5813, défaut majeur 8)', () => {
  // React n'avertit sur `act(...)` que si ce fanion global est absent — la
  // TYPE globale n'existe nulle part au dépôt (aucun autre test ne rend en
  // client), donc on la porte ici plutôt que d'écrire un `any`.
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    GlobalRegistrator.register();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await GlobalRegistrator.unregister();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = (onSend: (text: string) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={(payload) => onSend(payload.text)} />);
    });
    return container;
  };

  const type = (field: HTMLTextAreaElement, value: string) => {
    act(() => {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  // Reproduit EXACTEMENT le geste au doigt sur mobile : `pointerdown` PUIS
  // `click` — jamais `mousedown`, que rien dans `composer.tsx` n'écoute.
  // Rend l'événement `pointerdown` DISPATCHÉ : c'est lui qui dit si
  // `e.preventDefault()` a bien été appelé (`event.defaultPrevented`).
  const tap = (button: Element): PointerEvent => {
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    act(() => {
      button.dispatchEvent(down);
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    return down;
  };

  /**
   * happy-dom, à la différence d'un navigateur réel, ne déplace PAS
   * automatiquement le focus vers un bouton au `pointerdown` — impossible
   * donc d'observer ici le VOL de focus que `preventDefault()` empêche dans
   * WKWebView. `type()` ne simule que `.value` + `input` : il ne pose PAS le
   * focus réel du clavier, donc ce témoin le pose EXPLICITEMENT (`field.focus()`)
   * pour reproduire la précondition du geste NOMINAL — texte tapé, champ
   * focalisé, tap sur Envoyer.
   *
   * DEPUIS LE DÉFAUT 9 (revue #5668), `send()` ne redonne le focus QUE si le
   * champ l'AVAIT déjà (`keepFocus = document.activeElement === field`,
   * capturé AVANT l'envoi) — l'ancien rappel était INCONDITIONNEL et rouvrait
   * le clavier après un vocal ou une photo envoyés SANS avoir touché le
   * champ (témoin séparé ci-dessous). Ici, le champ avait le focus : il doit
   * le GARDER après l'envoi — retirer le rappel conditionnel fait échouer ce
   * test.
   */
  test('champ focalisé + tap sur Envoyer ⇒ le champ GARDE le focus (rattrapage de `send()`)', () => {
    const el = mount(() => {});
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'Bonjour');
    act(() => field.focus());
    expect(document.activeElement).toBe(field);
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;

    tap(sendButton);

    expect(document.activeElement).toBe(field);
  });

  /**
   * DÉFAUT 9 (revue #5668) — le rappel de focus était INCONDITIONNEL :
   * envoyer un vocal (`sendRecordingNow`) ou une photo sans jamais avoir
   * touché le champ ouvrait quand même le clavier, ce qui faisait DISPARAÎTRE
   * le micro de la rangée (`canRecord && !focused`). iOS ne pose jamais
   * `isTyping = true` à l'envoi (`ConversationView.swift:314`) : le focus y
   * reste ce qu'il ÉTAIT. Ce témoin envoie SANS jamais focaliser le champ, et
   * exige qu'il ne le reçoive PAS après coup.
   */
  test('envoi SANS avoir focalisé le champ ⇒ le champ NE REÇOIT PAS le focus après l’envoi', () => {
    const el = mount(() => {});
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'Bonjour'); // pose le TEXTE sans jamais focaliser (comme `type()` le documente).
    expect(document.activeElement).not.toBe(field);
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;

    tap(sendButton);

    expect(document.activeElement).not.toBe(field);
  });

  /**
   * Épingle le PREMIER des deux mécanismes du défaut majeur 8 : le bouton
   * d'envoi appelle bien `e.preventDefault()` sur `pointerdown` — sans quoi,
   * dans un navigateur réel (WKWebView compris), le `pointerdown` non
   * empêché déplacerait le focus vers le bouton une image avant que `send()`
   * ne le redonne au champ (le clignotement que le défaut décrit).
   */
  test('le `pointerdown` du bouton d’envoi est empêché (`preventDefault`)', () => {
    const el = mount(() => {});
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'Bonjour');
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;

    const down = tap(sendButton);

    expect(down.defaultPrevented).toBe(true);
  });

  /**
   * Épingle le SECOND mécanisme : malgré ce `preventDefault()` sur
   * `pointerdown`, le `click` qui suit atteint bien `onSend` — c'est le
   * témoin qui protège la coque iOS (revue-correction #5813, défaut majeur
   * 2) dans le moteur des tests, en attendant la capture WKWebView : un futur
   * diff qui casserait cet enchaînement (ex. un `stopPropagation` posé sur
   * `pointerdown`) romprait le bouton d'envoi SANS qu'aucun autre témoin ne
   * le voie.
   */
  test('l’envoi part quand même — le `click` survit au `preventDefault` de `pointerdown`', () => {
    let sent: string | undefined;
    const el = mount((text) => {
      sent = text;
    });
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'Bonjour');
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;

    const down = tap(sendButton);

    expect(down.defaultPrevented).toBe(true);
    expect(sent).toBe('Bonjour');
  });
});

/**
 * « COMPOSER » MET LE CURSEUR DANS LE CHAMP (revue #5814, défaut majeur 8)
 * — avant ce correctif, `document.activeElement` valait BODY après l'action
 * « Composer » du menu du message : `focusTakenRef.current = true`
 * (`use-message-menu.ts`) empêchait le menu de rendre le focus à la rangée,
 * mais rien ne le prenait à sa place.
 */
describe('Composer — « Composer » met le curseur dans le champ (revue #5814, défaut majeur 8)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    GlobalRegistrator.register();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await GlobalRegistrator.unregister();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mountWithReply = (replyTo?: { author: string; excerpt: string }) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={() => {}} {...(replyTo ? { replyTo } : {})} />);
    });
    return container;
  };

  test('sans citation au montage, le champ ne VOLE pas le focus', () => {
    const el = mountWithReply();
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    expect(document.activeElement).not.toBe(field);
  });

  test('une citation qui S’ARME (transition indéfini → défini, exactement « Composer ») ⇒ le champ REÇOIT le focus', () => {
    const el = mountWithReply();
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    expect(document.activeElement).not.toBe(field);

    act(() => {
      root.render(<Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'On se voit demain ?' }} />);
    });

    expect(document.activeElement).toBe(field);
    void el;
  });

  test('rester en citation (la référence de `replyTo` change sans transition) ⇒ ne REVOLE pas le focus déjà donné ailleurs', () => {
    mountWithReply({ author: 'Amina', excerpt: 'Premier texte' });
    const field = container.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    // Le lecteur a explicitement DÉPLACÉ son focus ailleurs après l'armement.
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    act(() => {
      elsewhere.focus();
    });
    expect(document.activeElement).toBe(elsewhere);

    // Un rendu parent RECONSTRUIT l'objet `replyTo` (référence neuve, même
    // valeur) — motif `routes/thread.tsx`, qui ne mémoïse pas cet objet.
    act(() => {
      root.render(<Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Premier texte' }} />);
    });

    expect(document.activeElement).toBe(elsewhere);
    void field;
    elsewhere.remove();
  });
});

/**
 * #5668 — LE COMPOSEUR TIENT CE QU'IL PROMET : chaque contrôle a un
 * GESTIONNAIRE (critère (1) de #5668 — miroir 6.2 de `check-thread-states.mjs`,
 * « 0 contrôle sans gestionnaire »), et le geste complet — sélection → aperçu
 * → envoi — traverse `onSend` avec les pièces jointes.
 *
 * `ComposerTray` est CHARGÉ À LA DEMANDE (`lazy()`) : chaque test qui monte
 * le tiroir laisse le temps à l'`import()` de résoudre ET à React de peindre
 * le résultat — `flush()` boucle sur des micro-tâches réelles plutôt que de
 * deviner un nombre fixe de `Promise.resolve()`.
 */
/**
 * LES DEUX EMOJIS RAPIDES SONT LA TÊTE DE LA LISTE UNIQUE
 * (revue-correction #5668) — ils étaient écrits en dur dans `composer.tsx` et
 * avaient DIVERGÉ de `QUICK_REACTIONS` (`👍` au lieu de `😂` en tête), donc
 * de `quickSendDefaultEmojis` (`UniversalComposerBar+Send.swift:198`). Le
 * témoin épingle la DÉRIVATION, pas les deux caractères : changer la liste
 * change les deux boutons, et rien d'autre n'est à resynchroniser.
 */
describe('Composer — les deux emojis d’envoi rapide', () => {
  test('ce sont les DEUX PREMIERS de QUICK_REACTIONS, jamais une seconde liste', () => {
    const html = renderToStaticMarkup(<Composer onSend={() => {}} />);
    expect(html).toContain(`Envoyer ${QUICK_REACTIONS[0]}`);
    expect(html).toContain(`Envoyer ${QUICK_REACTIONS[1]}`);
    expect(html).not.toContain(`Envoyer ${QUICK_REACTIONS[2]}`);
  });
});

describe('Composer — le tiroir des pièces jointes (#5668)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    GlobalRegistrator.register();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await GlobalRegistrator.unregister();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = (onSend: (payload: { text: string; attachments: readonly { readonly name: string }[] }) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={onSend} />);
    });
    return container;
  };

  /** Laisse l'`import()` de `./composer-tray` résoudre ET React peindre le
   * résultat — plusieurs tours de micro-tâches, sous `act()` pour que React
   * n'avertisse pas d'une mise à jour hors `act`. */
  const flush = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
  };

  test('le bouton « + » BASCULE le panneau — aria-label et glyphe changent, AUCUN état intermédiaire mort', async () => {
    const el = mount(() => {});
    const plus = el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!;

    act(() => {
      plus.click();
    });
    await flush();

    expect(el.querySelector('[aria-label="Fermer le menu des pièces jointes"]')).not.toBeNull();
    expect(el.querySelector('[role="group"][aria-label="Types de pièces jointes"]')).not.toBeNull();

    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Fermer le menu des pièces jointes"]')!.click();
    });
    await flush();

    expect(el.querySelector('[aria-label="Ouvrir le menu des pièces jointes"]')).not.toBeNull();
    expect(el.querySelector('[role="group"][aria-label="Types de pièces jointes"]')).toBeNull();
  });

  test('sélectionner une photo : le panneau se FERME, une tuile d’aperçu apparaît, ET reste visible panneau fermé', async () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
    });
    await flush();

    const input = el.querySelector<HTMLInputElement>('[aria-label="Choisir des photos"]')!;
    const file = new File([new Uint8Array([1, 2, 3])], 'plage.jpg', { type: 'image/jpeg' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    act(() => {
      Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    // Le panneau s'est refermé (miroir `fire()`, `+Attachments.swift:298-303`).
    expect(el.querySelector('[role="group"][aria-label="Types de pièces jointes"]')).toBeNull();
    expect(el.querySelector('[aria-label="Ouvrir le menu des pièces jointes"]')).not.toBeNull();
    // La bande d'aperçu, elle, reste — pièce toujours en attente.
    expect(el.querySelector('[aria-label="Supprimer plage.jpg"]')).not.toBeNull();
  });

  test('retirer une pièce en attente : la tuile disparaît, la bande aussi si c’était la dernière', async () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
    });
    await flush();
    const input = el.querySelector<HTMLInputElement>('[aria-label="Choisir un fichier"]')!;
    const file = new File([new Uint8Array([1])], 'notes.pdf', { type: 'application/pdf' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    act(() => {
      Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(el.querySelector('[aria-label="Supprimer notes.pdf"]')).not.toBeNull();

    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Supprimer notes.pdf"]')!.click();
    });
    await flush();

    expect(el.querySelector('[aria-label="Supprimer notes.pdf"]')).toBeNull();
    expect(el.querySelector('[role="group"][aria-label="Pièces jointes en attente"]')).toBeNull();
  });

  test('envoyer un texte VIDE avec une pièce jointe part quand même — onSend reçoit attachments, pending est VIDÉ', async () => {
    let sent: { readonly text: string; readonly attachments: readonly { readonly name: string }[] } | null = null;
    const el = mount((payload) => {
      sent = payload;
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
    });
    await flush();
    const input = el.querySelector<HTMLInputElement>('[aria-label="Choisir des photos"]')!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }));
    act(() => {
      Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    // Aucun texte tapé : le bouton d'envoi est quand même LÀ (une pièce
    // suffit, miroir `hasContent = hasText || !allAttachments.isEmpty`).
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;
    act(() => {
      sendButton.click();
    });

    expect(sent).not.toBeNull();
    expect(sent!.text).toBe('');
    expect(sent!.attachments).toHaveLength(1);
    expect(sent!.attachments[0]?.name).toBe('a.png');
    // Envoyé ⇒ la bande d'aperçu disparaît.
    expect(el.querySelector('[aria-label="Supprimer a.png"]')).toBeNull();
  });

  /**
   * LOI 4 SUR LE MICRO (revue-correction #5668) — happy-dom n'a NI
   * `MediaRecorder` NI `navigator.mediaDevices` : l'environnement ne peut pas
   * enregistrer, donc la porte n'est PAS rendue (spécification #5668 § 0,
   * « le micro n'est pas rendu »). La version livrée le rendait toujours et
   * n'annonçait l'impossibilité qu'APRÈS le tap.
   */
  test('sans moteur d’enregistrement, NI le micro de la rangée NI la tuile « Vocal » ne sont rendus', async () => {
    const el = mount(() => {});
    expect(el.querySelector('[aria-label="Enregistrer un message vocal"]')).toBeNull();

    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
    });
    await flush();

    expect(el.querySelector('[role="group"][aria-label="Types de pièces jointes"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Enregistrer un message vocal"]')).toBeNull();
  });

  /**
   * LE CHEMIN RÉEL DU MICRO, du tap à la bande — et il exerce
   * `createBrowserRecorderEngine` (`use-recorder.ts`), qu'AUCUN témoin de
   * `use-recorder.test.tsx` n'atteint (ils injectent tous un moteur
   * bouchonné). Le bouchon est posé au niveau du NAVIGATEUR, là où le défaut
   * se produit : `getUserMedia` qui REJETTE, c'est-à-dire la permission
   * refusée. La bande doit alors porter SA cause, « Réessayer » ET une
   * sortie — la version livrée n'avait aucune sortie, et la bande restait
   * jusqu'au rechargement de la page.
   */
  test('micro refusé par le navigateur ⇒ bande DESSINÉE avec « Réessayer » et « Fermer », et « Fermer » la ferme', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', { value: class {}, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      // Défaut 5 (revue #5668) : un VRAI `DOMException` nommé
      // `NotAllowedError`, comme `getUserMedia` le rejette réellement — un
      // `Error` au message homonyme (l'ancien bouchon) ne portait aucun
      // `.name` exploitable et masquait la projection de `error.name`.
      value: { getUserMedia: () => Promise.reject(new DOMException('refusé', 'NotAllowedError')) },
      configurable: true,
    });
    try {
      const el = mount(() => {});
      const mic = el.querySelector<HTMLButtonElement>('[aria-label="Enregistrer un message vocal"]');
      expect(mic).not.toBeNull();

      act(() => {
        mic!.click();
      });
      await flush();

      expect(el.textContent).toContain('Micro refusé');
      expect(el.querySelector('[aria-label="Fermer l’avertissement"]')).not.toBeNull();
      expect(el.textContent).toContain('Réessayer');

      act(() => {
        el.querySelector<HTMLButtonElement>('[aria-label="Fermer l’avertissement"]')!.click();
      });
      await flush();

      expect(el.textContent).not.toContain('Micro refusé');
    } finally {
      Reflect.deleteProperty(globalThis, 'MediaRecorder');
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  /**
   * DÉFAUT 5 (revue #5668) — `NotFoundError` (aucun micro sur l'appareil),
   * `NotReadableError` (micro pris par une autre application) et
   * `NotSupportedError` (constaté, mesuré, en Chromium HEADLESS) ne sont PAS
   * un refus : aucun réglage à changer ne les résout, donc AUCUN
   * « Réessayer » — seulement « Micro indisponible sur ce navigateur » et
   * une sortie. La version livrée les envoyait tous vers la bande de refus,
   * avec un « Réessayer » qui ne pouvait jamais aboutir (loi 4).
   */
  const unsupportedRecorderNames = [
    'NotFoundError', // aucun micro sur l'appareil.
    'NotReadableError', // micro déjà pris par une autre application.
    'NotSupportedError', // mesuré en Chromium headless.
    'AbortError', // abandon du navigateur.
    'OverconstrainedError', // contrainte audio non satisfaite.
  ] as const;

  for (const domExceptionName of unsupportedRecorderNames) {
    test(`${domExceptionName} ⇒ « Micro indisponible sur ce navigateur », SANS « Réessayer »`, async () => {
      Object.defineProperty(globalThis, 'MediaRecorder', { value: class {}, configurable: true });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: () => Promise.reject(new DOMException('indisponible', domExceptionName)) },
        configurable: true,
      });
      try {
        const el = mount(() => {});
        act(() => {
          el.querySelector<HTMLButtonElement>('[aria-label="Enregistrer un message vocal"]')!.click();
        });
        await flush();

        expect(el.textContent).toContain('Micro indisponible sur ce navigateur');
        expect(el.textContent).not.toContain('Réessayer');
        expect(el.textContent).not.toContain('Micro refusé');
      } finally {
        Reflect.deleteProperty(globalThis, 'MediaRecorder');
        Reflect.deleteProperty(navigator, 'mediaDevices');
      }
    });
  }

  /**
   * UN FICHIER ÉCARTÉ LE DIT (revue-correction #5668) — au-delà de
   * `SMALL_FILE_THRESHOLD` (50 Mo, `@meeshy/shared/types/attachment.ts:487`),
   * le chemin REST de ce lot n'est PAS celui du dépôt (c'est TUS). La version
   * livrée l'acceptait en silence, et l'envoi échouait bien plus tard, sans
   * cause lisible.
   */
  test('un fichier de plus de 50 Mo est ÉCARTÉ, et la bande dit pourquoi', async () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
    });
    await flush();

    const input = el.querySelector<HTMLInputElement>('[aria-label="Choisir un fichier"]')!;
    const huge = new File([new Uint8Array([1])], 'film.mov', { type: 'video/quicktime' });
    Object.defineProperty(huge, 'size', { value: 51 * 1024 * 1024, configurable: true });
    const transfer = new DataTransfer();
    transfer.items.add(huge);
    act(() => {
      Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    expect(el.querySelector('[aria-label="Supprimer film.mov"]')).toBeNull();
    expect(el.textContent).toContain('dépasse 50 Mo');
    // Un refus de TAILLE ne se rejoue pas : aucun « Réessayer » (loi 4).
    expect(el.textContent).not.toContain('Réessayer');
  });

  /**
   * LES DROITS DU PARTICIPANT (revue-correction #5668) — `canSendImages:
   * false` ⇒ la tuile « Photos » n'est PAS rendue. Et si AUCUN type n'est
   * permis, le « + » lui-même disparaît : un panneau vide est une porte sur
   * un mur.
   */
  test('sans droit d’image, la tuile « Photos » ne se rend pas ; sans AUCUN droit, le « + » non plus', async () => {
    const noImages = { ...DEFAULT_USER_PERMISSIONS, canSendImages: false };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={() => {}} rights={noImages} />);
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
    });
    await flush();
    expect(container.querySelector('[aria-label="Choisir des photos"]')).toBeNull();
    expect(container.querySelector('[aria-label="Choisir un fichier"]')).not.toBeNull();

    const nothing = {
      ...DEFAULT_USER_PERMISSIONS,
      canSendImages: false,
      canSendFiles: false,
      canSendAudios: false,
      canSendVideos: false,
    };
    act(() => {
      root.render(<Composer onSend={() => {}} rights={nothing} />);
    });
    await flush();
    expect(container.querySelector('[aria-label="Ouvrir le menu des pièces jointes"]')).toBeNull();
  });
});
