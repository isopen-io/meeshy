import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { translatedRefusal, useAdminAction, type AdminGesture } from './use-admin-action';

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en', 'es', 'pt'] });

type Probe = { run: (gesture: AdminGesture<{ readonly id: string }>) => Promise<{ readonly id: string } | null>; state: () => string; reset: () => void };

async function ouvrir(language: 'fr' | 'en' | 'es' | 'pt' = 'fr') {
  const annonces: { message: string; tone: string | undefined }[] = [];
  const handle: { current: Probe | null } = { current: null };

  function Harness() {
    const action = useAdminAction<{ readonly id: string }>({
      language,
      onAnnounce: (message, tone) => annonces.push({ message, tone }),
    });
    handle.current = { run: action.run, state: () => JSON.stringify(action.state), reset: action.reset };
    return <p data-state>{JSON.stringify(action.state)}</p>;
  }

  const host = await mount(<Harness />);
  const probe = (): Probe => {
    if (handle.current === null) throw new Error('harnais non monté');
    return handle.current;
  };
  const run = async (gesture: AdminGesture<{ readonly id: string }>) => {
    let result: { readonly id: string } | null = null;
    await act(async () => {
      result = await probe().run(gesture);
    });
    return result;
  };
  return { host, annonces, run, phase: () => JSON.parse(host.querySelector('[data-state]')?.textContent ?? '{}') as { phase: string; message?: string }, reset: () => act(async () => probe().reset()) };
}

const ok = (id: string): ApiResult<{ readonly id: string }> => ({ ok: true, data: { id } });
const fail = (status: number, error = ''): ApiResult<{ readonly id: string }> => ({ ok: false, status, error });

describe('useAdminAction — instantané, optimiste, réseau, retour arrière', () => {
  test('succès : rend la donnée, dit le succès (ton neutre) et passe à « done »', async () => {
    const { run, annonces, phase } = await ouvrir();
    const result = await run({ call: async () => ok('x'), success: 'admin.kit.copied' });

    expect(result).toEqual({ id: 'x' });
    expect(annonces).toEqual([{ message: 'Identifiant copié', tone: 'neutral' }]);
    expect(phase()).toEqual({ phase: 'done', message: 'Identifiant copié' });
  });

  test('un succès invalide les lectures demandées — la vérité revient du serveur', async () => {
    appQueryClient.setQueryData(['admin', 'probe', 'a'], { v: 1 });
    appQueryClient.setQueryData(['admin', 'autre'], { v: 2 });
    const { run } = await ouvrir();
    await run({ call: async () => ok('x'), success: 'admin.kit.copied', invalidate: [['admin', 'probe']] });

    expect(appQueryClient.getQueryState(['admin', 'probe', 'a'])?.isInvalidated).toBe(true);
    expect(appQueryClient.getQueryState(['admin', 'autre'])?.isInvalidated).toBe(false);
  });

  test('optimiste : l’effet est posé AVANT la réponse, et reste si le serveur accepte', async () => {
    appQueryClient.setQueryData(['admin', 'lien'], { active: true });
    const { run } = await ouvrir();
    let vuPendant: unknown = null;
    await run({
      call: async () => {
        vuPendant = appQueryClient.getQueryData(['admin', 'lien']);
        return ok('x');
      },
      success: 'admin.kit.copied',
      optimistic: { key: ['admin', 'lien'], apply: () => ({ active: false }) },
    });

    expect(vuPendant).toEqual({ active: false });
    expect(appQueryClient.getQueryData(['admin', 'lien'])).toEqual({ active: false });
  });

  test('refus : l’instantané est RESTAURÉ et le refus est annoncé en erreur', async () => {
    appQueryClient.setQueryData(['admin', 'lien'], { active: true });
    const { run, annonces, phase } = await ouvrir();
    const result = await run({
      call: async () => fail(403),
      success: 'admin.kit.copied',
      optimistic: { key: ['admin', 'lien'], apply: () => ({ active: false }) },
    });

    expect(result).toBeNull();
    expect(appQueryClient.getQueryData(['admin', 'lien'])).toEqual({ active: true });
    expect(annonces).toEqual([{ message: 'Vous n’avez pas le droit d’effectuer ce geste.', tone: 'error' }]);
    expect(phase().phase).toBe('error');
  });

  test('sans cache à défaire, rien n’est posé ni restauré', async () => {
    const { run } = await ouvrir();
    await run({ call: async () => fail(500), success: 'admin.kit.copied', optimistic: { key: ['admin', 'absent'], apply: () => ({ active: false }) } });
    expect(appQueryClient.getQueryData(['admin', 'absent'])).toBeUndefined();
  });

  test('un refus n’invalide rien : il n’y a rien de nouveau à relire', async () => {
    appQueryClient.setQueryData(['admin', 'probe', 'a'], { v: 1 });
    const { run } = await ouvrir();
    await run({ call: async () => fail(409), success: 'admin.kit.copied', invalidate: [['admin', 'probe']] });
    expect(appQueryClient.getQueryState(['admin', 'probe', 'a'])?.isInvalidated).toBe(false);
  });

  describe('les refus se disent en mots', () => {
    const cas: readonly [string, ApiResult<{ readonly id: string }> | 'throw', string][] = [
      ['403', fail(403, 'Forbidden'), 'Vous n’avez pas le droit d’effectuer ce geste.'],
      ['400 avec un message servi (jamais affiché : il est dans la langue du serveur)', fail(400, 'Le motif doit faire au moins 10 caractères.'), 'Le geste a été refusé : les informations sont invalides.'],
      ['400 sans message', fail(400, '   '), 'Le geste a été refusé : les informations sont invalides.'],
      ['409', fail(409, 'Conflict'), 'Le geste entre en conflit avec l’état actuel : rechargez puis réessayez.'],
      ['réseau (statut 0)', fail(0, 'Network'), 'Le réseau a échoué : réessayez dans un instant.'],
      ['exception de transport', 'throw', 'Le réseau a échoué : réessayez dans un instant.'],
      ['500', fail(500, 'Internal'), 'Le serveur n’a pas pu effectuer le geste.'],
    ];
    for (const [nom, reponse, attendu] of cas) {
      test(nom, async () => {
        const { run, annonces } = await ouvrir();
        await run({
          call: async () => {
            if (reponse === 'throw') throw new Error('coupé');
            return reponse;
          },
          success: 'admin.kit.copied',
        });
        expect(annonces[0]).toEqual({ message: attendu, tone: 'error' });
      });
    }
  });

  describe('un 400 ne montre jamais le texte du serveur — la phrase traduite, dans la langue du lecteur', () => {
    const attendu = {
      en: 'The action was refused: the information is invalid.',
      es: 'La acción fue rechazada: la información no es válida.',
      pt: 'A ação foi recusada: as informações são inválidas.',
    } as const;

    for (const language of ['en', 'es', 'pt'] as const) {
      test(language, async () => {
        const { run, annonces, phase } = await ouvrir(language);
        await run({ call: async () => fail(400, 'Statut invalide'), success: 'admin.kit.copied' });

        expect(annonces).toHaveLength(1);
        expect(annonces[0]?.message).not.toContain('Statut invalide');
        expect(annonces[0]?.message).not.toContain('invalide');
        expect(annonces[0]?.message).toBe(attendu[language]);
        expect(phase().message).toBe(attendu[language]);
      });
    }

    test('un refus que l’ÉCRAN a reconnu et dit lui-même (translatedRefusal) est affiché tel quel — c’est le seul', async () => {
      const { run, annonces } = await ouvrir('es');
      await run({ call: async () => translatedRefusal('Esta publicación ya estaba retirada.'), success: 'admin.kit.copied' });

      expect(annonces[0]?.message).toBe('Esta publicación ya estaba retirada.');
    });

    test('le texte anglais des erreurs de validation n’est pas servi non plus', async () => {
      const { run, annonces } = await ouvrir('es');
      await run({ call: async () => fail(400, 'body/status must be equal to one of the allowed values'), success: 'admin.kit.copied' });

      expect(annonces[0]?.message).not.toContain('allowed values');
    });
  });

  test('reset remet l’état au repos', async () => {
    const { run, phase, reset } = await ouvrir();
    await run({ call: async () => ok('x'), success: 'admin.kit.copied' });
    expect(phase().phase).toBe('done');
    await reset();
    expect(phase()).toEqual({ phase: 'idle' });
    await mounter.settle();
  });
});
