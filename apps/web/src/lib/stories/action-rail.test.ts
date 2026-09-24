import { describe, expect, test } from 'bun:test';

import {
  STORY_ACTION_RAIL_ORDER,
  freezeStoryActionRail,
  reconcileStoryActionRailComments,
  resolveStoryActionRailPlan,
  resolveStoryExportRailButtons,
  storyActionRailButtons,
  type StoryActionRailInputs,
} from './action-rail';

/** Le lecteur d'une story d'AUTRUI, tout allumé — chaque cas ne change qu'UNE
 * entrée, pour que le verdict nomme la porte qu'il éprouve. */
const autrui = (patch: Partial<StoryActionRailInputs> = {}): StoryActionRailInputs => ({
  storyId: 'st-1',
  isOwnStory: false,
  canReply: true,
  hasAudibleSound: true,
  commentCount: 3,
  hasTranslatableContent: true,
  ...patch,
});

describe('resolveStoryActionRailPlan — StoryActionRailPlan.resolve (StoryViewerView+Sidebar.swift:45-73)', () => {
  test('porte 1 — la story d’AUTRUI porte réagir, répondre, republier ; jamais vues ni export', () => {
    const plan = resolveStoryActionRailPlan(autrui());
    expect(plan.showsReact).toBe(true);
    expect(plan.showsReply).toBe(true);
    expect(plan.showsRepost).toBe(true);
    expect(plan.showsViews).toBe(false);
    expect(plan.showsExport).toBe(false);
  });

  test('porte 2 — MA story inverse exactement ces cinq-là : vues et export apparaissent, les trois autres tombent', () => {
    const plan = resolveStoryActionRailPlan(autrui({ isOwnStory: true }));
    expect(plan.showsReact).toBe(false);
    expect(plan.showsReply).toBe(false);
    expect(plan.showsRepost).toBe(false);
    expect(plan.showsViews).toBe(true);
    expect(plan.showsExport).toBe(true);
  });

  test('porte 3 — « répondre » exige les DEUX : une story d’autrui ET un chemin de réponse', () => {
    expect(resolveStoryActionRailPlan(autrui({ canReply: false })).showsReply).toBe(false);
    /* Le témoin de la CONJONCTION : sur MA story, `canReply` vrai ne suffit
       jamais — sans ce cas, un `showsReply: canReply` seul passerait la porte 3. */
    expect(resolveStoryActionRailPlan(autrui({ isOwnStory: true, canReply: true })).showsReply).toBe(false);
  });

  test('porte 4 — le bouton « commentaires » n’existe qu’au-dessus de ZÉRO', () => {
    expect(resolveStoryActionRailPlan(autrui({ commentCount: 0 })).showsComments).toBe(false);
    expect(resolveStoryActionRailPlan(autrui({ commentCount: 1 })).showsComments).toBe(true);
  });

  test('porte 5 — le son suit une piste AUDIBLE, les traductions un contenu traduisible, chacun le sien', () => {
    const muette = resolveStoryActionRailPlan(autrui({ hasAudibleSound: false }));
    expect(muette.showsSound).toBe(false);
    expect(muette.showsTranslations).toBe(true);

    const intraduisible = resolveStoryActionRailPlan(autrui({ hasTranslatableContent: false }));
    expect(intraduisible.showsTranslations).toBe(false);
    expect(intraduisible.showsSound).toBe(true);
  });

  test('« Envoyer » n’a aucune porte — il est du rail de TOUT LE MONDE, auteur compris', () => {
    expect(resolveStoryActionRailPlan(autrui()).showsForward).toBe(true);
    expect(resolveStoryActionRailPlan(autrui({ isOwnStory: true })).showsForward).toBe(true);
  });
});

describe('freezeStoryActionRail — le plan est CALCULÉ À L’ENTRÉE puis FIGÉ (directive 2026-07-10)', () => {
  test('FIXATION — un compteur qui change en cours de lecture ne change pas le plan, ni son IDENTITÉ', () => {
    const entree = freezeStoryActionRail(null, autrui({ commentCount: 3 }));
    /* Le compteur passe de 3 à 47 pendant la lecture (activité temps réel) :
       la VALEUR affichée vit, l'APPARTENANCE au rail ne bouge pas. Et le même
       objet revient — un rail qui se recompose à chaque message reçu est le
       clignotement que la directive interdit (Zero Unnecessary Re-render). */
    const pendant = freezeStoryActionRail(entree, autrui({ commentCount: 47 }));
    expect(pendant).toBe(entree);
  });

  test('FIXATION — un compteur qui tombe à ZÉRO ne RETIRE pas davantage le bouton', () => {
    const entree = freezeStoryActionRail(null, autrui({ commentCount: 3 }));
    const pendant = freezeStoryActionRail(entree, autrui({ commentCount: 0 }));
    expect(pendant.plan.showsComments).toBe(true);
  });

  test('la story SUIVANTE re-résout tout — le gel vaut pour une diapositive, jamais pour la lecture', () => {
    const entree = freezeStoryActionRail(null, autrui({ commentCount: 3 }));
    const suivante = freezeStoryActionRail(entree, autrui({ storyId: 'st-2', commentCount: 0 }));
    expect(suivante.storyId).toBe('st-2');
    expect(suivante.plan.showsComments).toBe(false);
  });

  test('le SON est la seule remontée à sens unique : il peut apparaître, jamais disparaître', () => {
    /* La piste audio d’une vidéo s’établit par un sondage ASYNCHRONE qui
       conclut souvent après le gel (`adaptiveOnChange(of: storyHasAudibleSound)`,
       `:604-608`) — sans cette remontée, une story sonore reste sans bouton
       pendant toute sa lecture. */
    const muette = freezeStoryActionRail(null, autrui({ hasAudibleSound: false }));
    expect(muette.plan.showsSound).toBe(false);
    const sonore = freezeStoryActionRail(muette, autrui({ hasAudibleSound: true }));
    expect(sonore.plan.showsSound).toBe(true);
    /* … et le retour en arrière n’existe pas : un sondage qui se contredit ne
       fait pas disparaître un bouton sous le doigt. */
    expect(freezeStoryActionRail(sonore, autrui({ hasAudibleSound: false }))).toBe(sonore);
  });

  test('la remontée du son ne ressuscite RIEN d’autre — les autres portes restent celles de l’entrée', () => {
    const entree = freezeStoryActionRail(null, autrui({ hasAudibleSound: false, commentCount: 0 }));
    const apres = freezeStoryActionRail(entree, autrui({ hasAudibleSound: true, commentCount: 12 }));
    expect(apres.plan.showsSound).toBe(true);
    expect(apres.plan.showsComments).toBe(false);
  });
});

describe('reconcileStoryActionRailComments — la SECONDE remontée à sens unique (:625-645)', () => {
  test('un compteur RÉCONCILIÉ à l’ouverture peut faire apparaître le bouton', () => {
    /* Le corpus du plateau est périmé jusqu’à 72 h : une story qui a bien un
       fil de commentaires entrait à `commentCount: 0`. La réconciliation
       d’OUVERTURE — et elle seule — corrige le gel. */
    const entree = freezeStoryActionRail(null, autrui({ commentCount: 0 }));
    const reconcilie = reconcileStoryActionRailComments(entree, { storyId: 'st-1', commentCount: 5 });
    expect(reconcilie.plan.showsComments).toBe(true);
  });

  test('une réconciliation à ZÉRO, ou sur une AUTRE story, ne touche à rien', () => {
    const entree = freezeStoryActionRail(null, autrui({ commentCount: 0 }));
    expect(reconcileStoryActionRailComments(entree, { storyId: 'st-1', commentCount: 0 })).toBe(entree);
    expect(reconcileStoryActionRailComments(entree, { storyId: 'st-2', commentCount: 9 })).toBe(entree);
  });

  test('une réconciliation sur un bouton DÉJÀ présent rend le même objet', () => {
    const entree = freezeStoryActionRail(null, autrui({ commentCount: 3 }));
    expect(reconcileStoryActionRailComments(entree, { storyId: 'st-1', commentCount: 9 })).toBe(entree);
  });
});

describe('resolveStoryExportRailButtons — les DEUX faces de `showsExport` (StoryExportRailButtons.resolve)', () => {
  test('`showsExport: false` ⇒ les trois tombent, même avec une progression en cours', () => {
    expect(resolveStoryExportRailButtons({ showsExport: false, saveProgress: 0.5 })).toEqual({
      showsShareButton: false,
      showsSaveButton: false,
      showsSaveProgressRing: false,
    });
  });

  test('`showsExport: true` + `saveProgress: null` ⇒ Partager ET Enregistrer, jamais l’anneau', () => {
    expect(resolveStoryExportRailButtons({ showsExport: true, saveProgress: null })).toEqual({
      showsShareButton: true,
      showsSaveButton: true,
      showsSaveProgressRing: false,
    });
  });

  test('`showsExport: true` + une progression ⇒ Partager reste, Enregistrer bascule vers l’anneau', () => {
    expect(resolveStoryExportRailButtons({ showsExport: true, saveProgress: 0.4 })).toEqual({
      showsShareButton: true,
      showsSaveButton: false,
      showsSaveProgressRing: true,
    });
  });
});

describe('storyActionRailButtons — l’ORDRE se lit dans la loi, il ne se recompte pas à côté', () => {
  test('le SON est en tête : il dit ce qui SE PASSE, les autres ce qu’on peut FAIRE (#4508)', () => {
    expect(STORY_ACTION_RAIL_ORDER[0]).toBe('sound');
  });

  test('la story d’autrui rend son rail dans l’ordre d’iOS, sans vues ni export', () => {
    expect(storyActionRailButtons(resolveStoryActionRailPlan(autrui()))).toEqual([
      'sound',
      'react',
      'reply',
      'forward',
      'repost',
      'comments',
      'translations',
    ]);
  });

  test('MA story rend le plan RÉDUIT : vues et export prennent la place de réagir/répondre/republier', () => {
    expect(storyActionRailButtons(resolveStoryActionRailPlan(autrui({ isOwnStory: true })))).toEqual([
      'sound',
      'forward',
      'views',
      'share',
      'save',
      'comments',
      'translations',
    ]);
  });

  test('« vues » n’apparaît JAMAIS à côté de « republier » — iOS les pose dans la MÊME fente', () => {
    const boutons = storyActionRailButtons(resolveStoryActionRailPlan(autrui()));
    expect(boutons).toContain('repost');
    expect(boutons).not.toContain('views');
  });

  test('un rail sans rien d’optionnel garde « Envoyer » — jamais un rail vide', () => {
    expect(
      storyActionRailButtons(
        resolveStoryActionRailPlan(
          autrui({ isOwnStory: false, canReply: false, hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false }),
        ),
      ),
    ).toEqual(['react', 'forward', 'repost']);
  });
});
