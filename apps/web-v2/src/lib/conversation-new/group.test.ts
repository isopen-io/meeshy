import { describe, expect, test } from 'bun:test';

import {
  GROUP_CREATION_FAILED,
  GROUP_CREATION_OFFLINE,
  GROUP_DESCRIPTION_MAX,
  GROUP_PARTICIPANTS_MAX,
  GROUP_REFUSAL,
  GROUP_TITLE_MAX,
  groupOutcomeOf,
  participantsToSend,
  validateGroupDraft,
  type GroupDraft,
} from './group';

/**
 * **CRÉER UN GROUPE** (#6706) — ce que ces témoins gardent, dans l'ordre de
 * gravité :
 *
 *  1. le créateur ne part JAMAIS dans `participantIds` — la passerelle rend
 *     alors 422 `INVALID_OPERATION`, un statut que la route ne déclare même pas ;
 *  2. un refus désigne son CHAMP, donc l'écran peut le poser sous lui ;
 *  3. les bornes sont celles du serveur, et le témoin les cite avec leur source.
 */

const VIEWER = 'u-viewer';

const draft = (partial: Partial<GroupDraft> = {}): GroupDraft => ({
  title: 'Équipe déploiement',
  description: '',
  participantIds: ['u-1', 'u-2'],
  ...partial,
});

describe('participantsToSend — qui part réellement', () => {
  test('le LECTEUR est retiré : la passerelle rend 422 si on l’y met', () => {
    expect(participantsToSend(['u-1', VIEWER, 'u-2'], VIEWER)).toEqual(['u-1', 'u-2']);
  });

  test('les doublons sont fondus, l’ORDRE de choix est gardé', () => {
    expect(participantsToSend(['u-2', 'u-1', 'u-2'], VIEWER)).toEqual(['u-2', 'u-1']);
  });

  test('les valeurs vides ou blanches ne partent pas', () => {
    expect(participantsToSend(['u-1', '', '   '], VIEWER)).toEqual(['u-1']);
  });

  test('sans lecteur connu, personne n’est retiré à tort', () => {
    expect(participantsToSend(['u-1', 'u-2'], null)).toEqual(['u-1', 'u-2']);
  });
});

describe('validateGroupDraft — le corps EXACT, ou le champ à blâmer', () => {
  test('le corps n’envoie que ce qui est rempli : aucune description vide', () => {
    expect(validateGroupDraft(draft(), VIEWER)).toEqual({
      ok: true,
      body: { title: 'Équipe déploiement', participantIds: ['u-1', 'u-2'] },
    });
  });

  test('une description remplie part, élaguée', () => {
    const validated = validateGroupDraft(draft({ description: '  Nos échanges internes  ' }), VIEWER);
    expect(validated.ok && validated.body.description).toBe('Nos échanges internes');
  });

  /**
   * LA PASSERELLE N'EXIGE PAS DE TITRE, ET NOUS SI. Son schéma le dit en prose
   * (« required for group/public ») sans l'imposer ; un groupe sans titre
   * recevrait un titre DÉRIVÉ à l'affichage. Depuis #6790 on sait ce que coûte
   * un titre qu'aucun humain n'a choisi.
   */
  test('un titre vide désigne son champ — rien ne part', () => {
    expect(validateGroupDraft(draft({ title: '   ' }), VIEWER)).toEqual({ ok: false, field: 'title' });
  });

  test(`un titre de plus de ${GROUP_TITLE_MAX} caractères désigne son champ`, () => {
    expect(validateGroupDraft(draft({ title: 'x'.repeat(GROUP_TITLE_MAX + 1) }), VIEWER)).toEqual({ ok: false, field: 'title' });
    expect(validateGroupDraft(draft({ title: 'x'.repeat(GROUP_TITLE_MAX) }), VIEWER).ok).toBe(true);
  });

  test(`une description de plus de ${GROUP_DESCRIPTION_MAX} caractères désigne son champ`, () => {
    expect(validateGroupDraft(draft({ description: 'x'.repeat(GROUP_DESCRIPTION_MAX + 1) }), VIEWER)).toEqual({
      ok: false,
      field: 'description',
    });
  });

  /* Le serveur accepte `participantIds: []` — il créerait un groupe d'une seule
     personne. Ce n'est pas un groupe, c'est une note. */
  test('aucun participant désigne la liste, même si le serveur l’accepterait', () => {
    expect(validateGroupDraft(draft({ participantIds: [] }), VIEWER)).toEqual({ ok: false, field: 'participants' });
  });

  test('une liste réduite au SEUL lecteur est vide une fois filtrée', () => {
    expect(validateGroupDraft(draft({ participantIds: [VIEWER] }), VIEWER)).toEqual({ ok: false, field: 'participants' });
  });

  test(`plus de ${GROUP_PARTICIPANTS_MAX} participants désigne la liste`, () => {
    const trop = Array.from({ length: GROUP_PARTICIPANTS_MAX + 1 }, (_, index) => `u-${index}`);
    expect(validateGroupDraft(draft({ participantIds: trop }), VIEWER)).toEqual({ ok: false, field: 'participants' });
  });

  test('le titre est élagué avant de partir', () => {
    const validated = validateGroupDraft(draft({ title: '  Équipe  ' }), VIEWER);
    expect(validated.ok && validated.body.title).toBe('Équipe');
  });

  test('chaque champ a sa phrase — aucun refus ne reste muet', () => {
    for (const field of ['title', 'description', 'participants'] as const) {
      expect(GROUP_REFUSAL[field].length).toBeGreaterThan(0);
    }
  });
});

describe('groupOutcomeOf — ce qu’un refus DIT', () => {
  test('créé ⇒ on ouvre le fil rendu', () => {
    expect(groupOutcomeOf({ result: { ok: true, data: { id: 'c-9' } }, online: true })).toEqual({
      kind: 'open',
      conversationId: 'c-9',
    });
  });

  /* Le 422 ne devrait plus se produire (le créateur est filtré), mais il est
     NOMMÉ plutôt qu'avalé : s'il arrive, le message doit désigner la liste,
     seul endroit où l'utilisateur peut agir. */
  test('422 ⇒ la LISTE est blâmée, jamais un refus générique', () => {
    expect(groupOutcomeOf({ result: { ok: false, status: 422 }, online: true })).toEqual({
      kind: 'invalid',
      field: 'participants',
      message: GROUP_REFUSAL.participants,
    });
  });

  test('un échec en ligne dit de réessayer', () => {
    expect(groupOutcomeOf({ result: { ok: false, status: 500 }, online: true })).toEqual({
      kind: 'failure',
      message: GROUP_CREATION_FAILED,
    });
  });

  /* Aucune file ne rejoue une création : on ne promet pas que le groupe
     « se créera à la reconnexion ». */
  test('hors ligne, le message dit la cause et le geste qui débloque', () => {
    expect(groupOutcomeOf({ result: { ok: false, status: 0 }, online: false })).toEqual({
      kind: 'failure',
      message: GROUP_CREATION_OFFLINE,
    });
  });
});
