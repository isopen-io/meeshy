import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { RevealPhase } from '@/lib/reading-mode/protection';
import { RevealPhaseChannel } from '@/lib/reading-mode/reveal-phase-channel';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProtectedContent } from './protected-content';

/**
 * **LA PHASE DE RÉVÉLATION REMONTE — PAR UN SEUL CANAL** (#7142, critère 3).
 *
 * Le cycle de révélation a un seul domicile (`lib/reading-mode/protection.ts`)
 * et un seul porteur d'état (`ProtectedContent`, `useState` ligne 97). Le nom
 * accessible de la rangée, lui, se compose AU-DESSUS (`thread-modes.tsx:388`,
 * posé sur `[data-row]` ligne 482). Entre les deux, rien : `composeMessageLabel`
 * accepte `phase` et retombe sur son défaut FERMÉ, si bien qu'une rangée
 * révélée peint son contenu sous un nom qui dit encore « Contenu masqué ».
 *
 * ## POURQUOI UN CANAL, ET PAS UNE PROP À TRAVERS LES DEUX PEAUX
 *
 * `FocalRow` et `Bubble` sont `memo`. Faire descendre un rappel jusqu'à
 * `ProtectedContent` obligerait CHAQUE peau à le relayer — deux relais à tenir
 * en accord, c'est-à-dire la forme exacte que le critère 3 interdit (« UN SEUL
 * mécanisme, partagé par les deux peaux »). Le canal les laisse toutes deux
 * INCHANGÉES : elles ne savent rien de la remontée, donc elles ne peuvent pas
 * en diverger.
 *
 * Le canal ne porte QUE l'émission. La valeur du contexte est stable (une
 * fonction), donc publier ne re-rend aucun consommateur — le registre vit chez
 * l'hôte, qui est seul à re-rendre. Coût mesuré avant d'être payé : trois
 * changements d'état par révélation, ≈ 1,1 ms pour 20 rangées visibles, soit
 * moins de 7 % du budget d'une image (commentaire de #7142).
 *
 * ## CE QUE CE FICHIER MESURE, ET CE QU'IL NE MESURE PAS
 *
 * Ici : le composant qui TIENT la phase la PUBLIE, à chaque transition, et se
 * tait quand personne n'écoute. Le fait que le nom accessible de la rangée
 * change bien se mesure sur le chemin produit, où `[data-row]` existe —
 * jamais ici, où il n'y a pas de rangée.
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

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

/** Ce qu'un hôte reçoit : la suite des phases, dans l'ordre, par message. */
const journal = () => {
  const recu: Array<{ readonly messageId: string; readonly phase: RevealPhase['phase'] }> = [];
  return {
    recu,
    publish: (messageId: string, phase: RevealPhase) => {
      recu.push({ messageId, phase: phase.phase });
    },
  };
};

describe('ProtectedContent publie sa phase de révélation', () => {
  test("le montage d'un voile annonce son état FERMÉ — l'hôte n'a pas à le deviner", async () => {
    const canal = journal();
    await mounter.mount(
      <RevealPhaseChannel publish={canal.publish}>
        <ProtectedContent messageId="m-voile" kind="veiled" isViewOnce={false} contentLength={20} attachments={[]} surface="row">
          <span>Le code du coffre est 4817-2290.</span>
        </ProtectedContent>
      </RevealPhaseChannel>,
    );

    expect(canal.recu).toEqual([{ messageId: 'm-voile', phase: 'hidden' }]);
  });

  test('la révélation est publiée — et c est ELLE qui manquait au nom accessible de la rangée', async () => {
    const canal = journal();
    const host = await mounter.mount(
      <RevealPhaseChannel publish={canal.publish}>
        <ProtectedContent messageId="m-voile" kind="veiled" isViewOnce={false} contentLength={20} attachments={[]} surface="row">
          <span>Le code du coffre est 4817-2290.</span>
        </ProtectedContent>
      </RevealPhaseChannel>,
    );

    await mounter.click(host.querySelector('button[data-protected="hidden"]'));

    expect(host.querySelector('[data-protected="revealed"]')).not.toBe(null);
    expect(canal.recu.map((entree) => entree.phase)).toEqual(['hidden', 'revealed']);
    expect(canal.recu.every((entree) => entree.messageId === 'm-voile')).toBe(true);
  });

  /**
   * LE MESSAGE DÉJÀ BRÛLÉ À L'ARRIVÉE part de `consumed` (`protected-content.tsx:97`)
   * — un hôte qui supposerait `hidden` au montage composerait « Contenu masqué »
   * sur une rangée qui rend son tombstone.
   */
  test("un message déjà brûlé annonce `consumed`, jamais `hidden`", async () => {
    const canal = journal();
    await mounter.mount(
      <RevealPhaseChannel publish={canal.publish}>
        <ProtectedContent messageId="m-brule" kind="burned" isViewOnce contentLength={20} attachments={[]} surface="row">
          <span>rien à lire</span>
        </ProtectedContent>
      </RevealPhaseChannel>,
    );

    expect(canal.recu).toEqual([{ messageId: 'm-brule', phase: 'consumed' }]);
  });

  /**
   * HORS CANAL, RIEN NE CASSE. `ProtectedContent` est monté par des hôtes qui
   * n'ont aucun nom accessible à tenir (`protection-notice.test.tsx` le monte
   * nu). Un canal absent doit être un silence, jamais une panne — c'est la
   * condition pour que ce mécanisme n'ait pas à être câblé partout.
   */
  test('monté sans canal, le composant rend et révèle comme avant', async () => {
    const host = await mounter.mount(
      <ProtectedContent messageId="m-orphelin" kind="veiled" isViewOnce={false} contentLength={20} attachments={[]} surface="row">
        <span>Le code du coffre est 4817-2290.</span>
      </ProtectedContent>,
    );

    expect(host.querySelector('[data-protected="hidden"]')).not.toBe(null);
    await mounter.click(host.querySelector('button[data-protected="hidden"]'));
    expect(host.querySelector('[data-protected="revealed"]')).not.toBe(null);
  });
});
