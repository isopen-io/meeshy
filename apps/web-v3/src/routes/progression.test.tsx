import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BADGE_THRESHOLDS, ENGAGEMENT_ACHIEVEMENT_KEYS, ENGAGEMENT_AXES, ENGAGEMENT_AXIS_WEIGHTS } from '@meeshy/shared/types/engagement';
import { axesByFamily, resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { ACHIEVEMENT_COPY, AXIS_LABELS } from '@/lib/view/progression';

import { ElansHero, MeeshDetail, ProgressionBody } from './progression';
import { AchievementsSection, AxisRow, GeneratedAchievements, ProgressionError, ProgressionSkeleton } from './progression-parts';

/**
 * L'ÉCRAN « PROGRESSION », RENDU (#5547) — ce que les témoins purs ne prouvent
 * pas : qui AFFICHE ce que la loi décide. Un résolveur juste dont la valeur
 * n'atteint aucun pixel n'a corrigé personne (§ Prisme, cycle 122).
 *
 * `renderToStaticMarkup` et non un DOM (même méthode que `auth-screens.test.tsx`) :
 * c'est l'ÉTAT INITIAL qui est mesuré, sans TanStack Query — `ProgressionBody`
 * est pur, c'est la raison de la découpe.
 */

const fixture = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const html = renderToStaticMarkup(<ProgressionBody progress={fixture} />);

/**
 * Le MÊME écran, servi par une passerelle qui ne connaît AUCUN des trois blocs
 * optionnels — un client déployé avant ce lot, ou parlant à une version
 * antérieure. C'est le support des témoins d'ABSENCE, qui doivent retirer ce
 * qu'ils prétendent absent plutôt que de compter sur une fixture incomplète.
 */
const sansBlocsOptionnels = (() => {
  // Les clés sont OMISES, pas posées à `undefined` : sous
  // `exactOptionalPropertyTypes`, « absent » et « présent et undefined » sont
  // deux types distincts, et c'est bien l'ABSENCE que ce rendu doit servir.
  const { meesh: _m, elan: _e, achievementReach: _r, ...sansOptions } = ENGAGEMENT_PROGRESS_FIXTURE;
  return renderToStaticMarkup(<ProgressionBody progress={resolveEngagementProgress(sansOptions)} />);
})();

/**
 * **Le total de badges se CALCULE, il ne s'écrit pas.** Il valait 65 (13 axes ×
 * 5 paliers) ; la famille sociale l'a porté à 85 (#5766). Un nombre en dur se
 * périme au premier axe ajouté, et fait échouer un témoin qui n'a rien à dire
 * sur le défaut réel — ici, il aurait accusé l'écran alors que seul le
 * catalogue avait bougé.
 */
const TOTAL_BADGES = ENGAGEMENT_AXES.length * BADGE_THRESHOLDS.length;

/**
 * LE HUB rend ce que la séquence partagée déclare : trois heros, trois portes.
 * Le DÉTAIL — les axes, les défis, les succès nommés — a migré vers les pages
 * dédiées, et les témoins l'y suivent. Un témoin qui reste sur l'ancienne
 * surface après une découpe ne mesure plus l'écran, il mesure l'habitude.
 */
describe('le hub — un utilisateur à mi-chemin', () => {
  test('ouvre sur le DERNIER succès décroché, pas sur le prochain', () => {
    expect(html).toContain('Dernier succès');
    expect(html).toContain('Décroché le');
  });

  /**
   * Les chiffres se DÉRIVENT de la fixture, ils ne s'y recopient pas — le
   * porteur a réglé le barème le 2026-09-09, et un nombre en dur accuserait
   * l'ÉCRAN d'une régression que seule la donnée a causée.
   */
  test('le hero du niveau dit le rang, le score, et la série qu\'il a recueillie', () => {
    expect(html).toContain(`Niveau ${fixture.level.level}`);
    expect(html).toContain(`${fixture.level.value} points`);
    expect(html).toContain(`${fixture.streak.value} jours d’affilée`);
    expect(html).toContain(`Record : ${ENGAGEMENT_PROGRESS_FIXTURE.streak.longestStreakDays} jours`);
  });

  test('la carte de niveau nomme le RANG suivant, jamais le seuil de points', () => {
    const manque = (fixture.level.nextThreshold ?? 0) - fixture.level.value;
    expect(html).toContain(`Encore ${manque} points avant le niveau ${fixture.level.level + 1}`);
    expect(html).not.toContain(`niveau ${fixture.level.nextThreshold}`);
  });

  /**
   * Le barème est DÉRIVÉ de `ENGAGEMENT_AXIS_WEIGHTS`. Ce témoin le vérifie en
   * cherchant les poids RÉELS : s'il les recopiait, il passerait au vert sur
   * une énumération figée, c'est-à-dire sur le défaut qu'il doit attraper.
   */
  test('le hero du niveau ÉNUMÈRE comment gagner, avec les poids du catalogue', () => {
    expect(html).toContain('Comment gagner des points');
    const poids = [...new Set(Object.values(ENGAGEMENT_AXIS_WEIGHTS))];
    for (const p of poids) expect(html).toContain(`+${p}`);
  });

  test('le hero du niveau dit le prix d\'une Meesh, servi par le serveur', () => {
    expect(html).toContain(`${fixture.meesh?.mintCost} points se convertissent en une Meesh`);
  });

  test('les barres sont des `progressbar` NOMMÉES, avec leur valeur', () => {
    const barres = html.match(/role="progressbar"[^>]*/g) ?? [];
    expect(barres.length).toBeGreaterThanOrEqual(1);
    for (const barre of barres) {
      expect(barre).toContain('aria-valuenow=');
      expect(barre).toMatch(/aria-label=|aria-labelledby=/);
    }
  });

  /**
   * Les trois portes sont là, chacune avec SON compte — c'est le compte qui
   * donne envie d'ouvrir. Un lien sans chiffre ne dit pas s'il vaut le geste.
   */
  test('les trois entrées de section annoncent leur compte', () => {
    expect(html).toContain('Badges');
    expect(html).toContain('Défis');
    expect(html).toContain('Succès');
    expect(html).toContain(`${fixture.badgesEarned} / ${TOTAL_BADGES}`);
    expect(html).toContain(
      `${fixture.achievements.filter((a) => a.unlocked).length} / ${fixture.achievements.length}`,
    );
  });

  /** Le DÉTAIL n'est plus ici : il a sa page. Le hub doit tenir court. */
  test('ne rend PAS le détail des axes — il a sa page', () => {
    expect(html).not.toContain('Palier');
  });
});

/**
 * LA PAGE DÉDIÉE DES BADGES — le détail que le hub n'annonce que par un compte.
 */
describe('la page des badges', () => {
  const htmlBadges = renderToStaticMarkup(
    <>
      {axesByFamily(fixture.axes).map((groupe) =>
        groupe.axes.map((axe) => <AxisRow key={axe.axisKey} axis={axe} />),
      )}
    </>,
  );

  test('rend les axes du catalogue ENTIER — y compris ceux à zéro', () => {
    for (const key of ENGAGEMENT_AXES) expect(htmlBadges).toContain(AXIS_LABELS[key]);
    expect(htmlBadges).toContain('Encore 1 avant le palier 1');
  });

  test('les pastilles pleines et vides CONCORDENT avec le compte du hub', () => {
    const obtenus = fixture.badgesEarned;
    expect(htmlBadges.match(/Palier \d+ atteint/g)?.length).toBe(obtenus);
    expect(htmlBadges.match(/Palier \d+ à atteindre/g)?.length).toBe(TOTAL_BADGES - obtenus);
  });
});

/**
 * LA PAGE DÉDIÉE DES SUCCÈS — les cinq composés, nommés un par un.
 */
describe('la page des succès', () => {
  const htmlSucces = renderToStaticMarkup(<AchievementsSection progress={fixture} />);

  test('quatre débloqués et datés, un verrouillé avec sa condition', () => {
    expect(htmlSucces).toContain('4 / 5');
    for (const key of ENGAGEMENT_ACHIEVEMENT_KEYS) expect(htmlSucces).toContain(ACHIEVEMENT_COPY[key].title);
    expect(htmlSucces).toContain(ACHIEVEMENT_COPY['achievement.all_content_types'].condition);
    expect(htmlSucces.match(/Obtenu le /g)?.length).toBe(4);
  });
});

/**
 * L'ÉTAT VIDE — porté par les HEROS eux-mêmes.
 *
 * Un bandeau « aucune activité » séparé existait ; il est devenu redondant, et
 * moins utile : le hero du dernier succès dit quoi faire pour décrocher le
 * premier, celui des élans dit ce qui multiplie. Une phrase générique
 * au-dessus de trois blocs qui disent la même chose en mieux occupait la place
 * sans rien ajouter.
 */
describe('le hub — un compte VIDE parle quand même', () => {
  const empty = renderToStaticMarkup(
    <ProgressionBody
      progress={resolveEngagementProgress({
        counters: [],
        milestones: [],
        streak: { currentStreakDays: 0, longestStreakDays: 0 },
        level: { engagementScore: 0 },
      })}
    />,
  );

  test('le hero des succès dit comment décrocher le PREMIER', () => {
    expect(empty).toContain('Premier succès');
    expect(empty).toContain('Envoyez un message');
    expect(empty).not.toContain('Décroché le');
  });

  test('le hero des élans explique ce qui multiplie, plutôt que de se taire', () => {
    expect(empty).toContain('Vos élans');
    expect(empty).toContain('multiplie');
  });

  test('le niveau 0 et les trois portes restent servis — un catalogue vide reste un catalogue', () => {
    expect(empty).toContain('Niveau 0');
    expect(empty).toContain(`0 / ${TOTAL_BADGES}`);
    expect(empty).toContain('0 / 5');
  });
});

describe('les autres états', () => {
  test('le squelette est marqué occupé — jamais un spinner', () => {
    const skeleton = renderToStaticMarkup(<ProgressionSkeleton />);
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).not.toContain('spinner');
  });

  test('l’erreur est une alerte NOMMÉE avec sa reprise ; hors ligne, c’est la coupure qui est nommée', () => {
    const noop = () => undefined;
    const online = renderToStaticMarkup(<ProgressionError message="Erreur 500" online onRetry={noop} />);
    expect(online).toContain('role="alert"');
    expect(online).toContain('Erreur 500');
    expect(online).toContain('Réessayer');

    const offline = renderToStaticMarkup(<ProgressionError message="Réseau indisponible" online={false} onRetry={noop} />);
    expect(offline).toContain('Hors ligne — aucune progression en mémoire');
    expect(offline).not.toContain('Réseau indisponible');
  });
});

/**
 * LE HÉROS DES MEESHES (#5743) — et surtout ce qu'il REFUSE d'afficher.
 *
 * La directive du porteur est une NÉGATION (« le bouton quand les points le
 * permettent, sinon pas de bouton »), et une négation ne se prouve que par un
 * témoin qui cherche l'absence. Les trois cas ci-dessous couvrent les trois
 * états possibles du bloc : absent, insuffisant, frappable.
 */
const rendreAvecMeesh = (meesh: {
  balance: number;
  mintedLifetime: number;
  debitablePoints: number;
  floorPoints: number;
  missingPoints: number;
  mintCost: number;
}) =>
  renderToStaticMarkup(
    <MeeshDetail
      meesh={resolveEngagementProgress({ ...ENGAGEMENT_PROGRESS_FIXTURE, meesh }).meesh!}
      onMint={() => {}}
      isMinting={false}
    />,
  );

describe('MeeshHero', () => {
  /**
   * L'absence se CONSTRUIT, elle ne s'hérite pas de la fixture.
   *
   * Ce témoin lisait `html` — le rendu de la fixture — et passait au vert
   * uniquement parce que la fixture ne portait PAS de bloc `meesh`. Le jour où
   * la démonstration en a reçu un (pour que le porteur voie le hero), il est
   * tombé : il ne mesurait pas l'absence du bloc, il mesurait un manque de
   * données. Un témoin d'absence doit RETIRER ce qu'il prétend absent.
   */
  test('n’affiche RIEN quand la passerelle ne sert pas le bloc', () => {
    expect(sansBlocsOptionnels).not.toContain('Meesh');
  });

  test('sans assez de points : le solde, le manque, et AUCUN bouton', () => {
    const rendu = rendreAvecMeesh({
      balance: 0,
      mintedLifetime: 0,
      debitablePoints: 100,
      floorPoints: 1300,
      missingPoints: 1121,
      mintCost: 1221,
    });
    expect(rendu).toContain('Aucune Meesh');
    expect(rendu).toContain('Encore 1121 points convertibles');
    // Le sort des points de conversation doit être DIT : ils partiront en
    // dernier, sans éteindre de badge (option C, #5743).
    expect(rendu).toContain('1300 points de conversation');
    expect(rendu).toContain('sans éteindre aucun badge');
    expect(rendu).not.toContain('<button');
  });

  test('avec assez de points : le bouton de conversion apparaît', () => {
    const rendu = rendreAvecMeesh({
      balance: 2,
      mintedLifetime: 5,
      debitablePoints: 1300,
      floorPoints: 40,
      missingPoints: 0,
      mintCost: 1221,
    });
    expect(rendu).toContain('2 Meeshes');
    expect(rendu).toContain('5 frappées depuis toujours');
    expect(rendu).toContain('Convertir 1221 points en une Meesh');
    expect(rendu).toContain('<button');
  });

  test('accorde le singulier — « 1 Meesh », jamais « 1 Meeshes »', () => {
    const rendu = rendreAvecMeesh({
      balance: 1,
      mintedLifetime: 1,
      debitablePoints: 0,
      floorPoints: 0,
      missingPoints: 1221,
      mintCost: 1221,
    });
    expect(rendu).toContain('>1 Meesh<');
    expect(rendu).toContain('1 frappée depuis toujours');
  });
});

/**
 * L'ÉLAN AFFICHÉ (#5749) — « un accélérateur qu'on ne voit pas n'accélère rien,
 * il surprend ». Et son corollaire, tout aussi important : au neutre il ne doit
 * RIEN occuper.
 */
const rendreAvecElan = (elan: {
  factor: number;
  activeFamilyCount: number;
  hasStanding: boolean;
  windowDays: number;
}) =>
  renderToStaticMarkup(
    <ElansHero progress={resolveEngagementProgress({ ...ENGAGEMENT_PROGRESS_FIXTURE, elan })} />,
  );

describe('ElanBanner', () => {
  test('n’affiche RIEN au neutre — un badge « ×1 » n’apprend rien', () => {
    const rendu = rendreAvecElan({ factor: 1, activeFamilyCount: 1, hasStanding: false, windowDays: 7 });
    expect(rendu).not.toContain('Élan');
  });

  test('n’affiche rien non plus quand la passerelle ne sert pas le bloc', () => {
    expect(sansBlocsOptionnels).not.toContain('Élan');
  });

  test('dit le facteur ET ce qui le porte — sinon il se subit au lieu de se piloter', () => {
    const rendu = rendreAvecElan({ factor: 3, activeFamilyCount: 3, hasStanding: false, windowDays: 7 });
    expect(rendu).toContain('Élan ×3');
    expect(rendu).toContain('3 familles actives');
    expect(rendu).toContain('sur 7 jours');
    expect(rendu).toContain('rapportent 3 fois plus');
  });

  test('nomme l’assise quand elle porte le dernier cran', () => {
    const rendu = rendreAvecElan({ factor: 5, activeFamilyCount: 4, hasStanding: true, windowDays: 7 });
    expect(rendu).toContain('Élan ×5');
    expect(rendu).toContain('plus votre assise');
  });

  test('accorde le singulier — « 1 famille active »', () => {
    const rendu = rendreAvecElan({ factor: 2, activeFamilyCount: 1, hasStanding: true, windowDays: 7 });
    expect(rendu).toContain('1 famille active');
  });

  test('borne un facteur aberrant servi par la passerelle', () => {
    // Le plafond est une règle de PRODUIT, pas une convention de sérialisation.
    const rendu = rendreAvecElan({ factor: 9, activeFamilyCount: 4, hasStanding: true, windowDays: 7 });
    expect(rendu).toContain('Élan ×5');
    expect(rendu).not.toContain('Élan ×9');
  });
});

/**
 * LES SUCCÈS GÉNÉRÉS EN RANGÉES (#5759) — ce que la fenêtre montre, et ce
 * qu'elle refuse de montrer.
 */
const rendreAvecDefis = (params: {
  reach: Record<string, number>;
  milestones?: Array<{ milestoneType: string; milestoneKey: string; reachedAt: string }>;
}) =>
  (() => {
    const progress = resolveEngagementProgress({
      ...ENGAGEMENT_PROGRESS_FIXTURE,
      milestones: params.milestones ?? [],
      achievementReach: params.reach,
    } as never);
    return progress.achievementSections === undefined
      ? ''
      : renderToStaticMarkup(<GeneratedAchievements sections={progress.achievementSections} />);
  })();

describe('GeneratedAchievements', () => {
  test('n’affiche rien quand la passerelle ne sert pas la carte', () => {
    expect(sansBlocsOptionnels).not.toContain('Défis');
  });

  test('ne rend JAMAIS un palier d’ampleur que le produit ne peut pas tenir', () => {
    // La plus grande conversation compte 300 membres. Le palier 1 000 est
    // retiré EN AMONT — il n'entre pas dans l'arbre, il n'est pas masqué en
    // CSS : un objectif qu'on ne peut pas tenir ne doit pas exister.
    //
    // Ce témoin ne dit RIEN de ce qui est visible : c'est la FENÊTRE qui en
    // décide, et confondre les deux le rendrait fragile. Il ne prouve qu'une
    // chose — l'inatteignable est absent.
    const rendu = rendreAvecDefis({ reach: { 'conversation.join.size': 300 } });
    expect(rendu).toContain('Conversation de 10 membres');
    expect(rendu).not.toContain('Conversation de 1 000 membres');
    expect(rendu).not.toContain('Conversation de 1 000 000 membres');
  });

  test('laisse le VOLUME visible sans mesure — répéter n’est pas impossible', () => {
    const rendu = rendreAvecDefis({ reach: {} });
    expect(rendu).toContain('conversations rejointes');
  });

  test('montre SEPT entrées à un compte qui n’a rien décroché', () => {
    const rendu = rendreAvecDefis({ reach: { 'conversation.join.size': 1000000 } });
    const cercles = rendu.slice(rendu.indexOf('Cercles'));
    const items = cercles.split('<li').length - 1;
    expect(items).toBeGreaterThanOrEqual(7);
  });

  test('ouvre la fenêtre DEUX PAR DEUX à mesure que les succès tombent', () => {
    // La règle est `max(7, acquis + 2)` : deux acquis laissent la fenêtre à 7
    // (2 + 2 = 4 < 7), dix acquis l'ouvrent à douze. C'est CETTE progression
    // qu'il faut mesurer — pas la présence d'un palier précis, qui dépendrait
    // de l'ordre de difficulté et rendrait le témoin fragile.
    const reach = { 'conversation.join.size': 1000000 };
    const compter = (rendu: string) => {
      const debut = rendu.indexOf('Cercles');
      return rendu.slice(debut, rendu.indexOf('</ul>', debut)).split('<li').length - 1;
    };

    const avec2 = compter(
      rendreAvecDefis({
        reach,
        milestones: [10, 100].map((t) => ({
          milestoneType: 'achievement',
          milestoneKey: `achievement.cercles.conversation.join.size:${t}`,
          reachedAt: '2026-09-08T00:00:00.000Z',
        })),
      }),
    );
    const avec10 = compter(
      rendreAvecDefis({
        reach,
        milestones: [
          ...[10, 100, 1000, 10000, 100000, 1000000].map((t) => ({
            milestoneType: 'achievement',
            milestoneKey: `achievement.cercles.conversation.join.size:${t}`,
            reachedAt: '2026-09-08T00:00:00.000Z',
          })),
          ...[1, 10, 100, 1000].map((t) => ({
            milestoneType: 'achievement',
            milestoneKey: `achievement.cercles.conversation.join.count:${t}`,
            reachedAt: '2026-09-08T00:00:00.000Z',
          })),
        ],
      }),
    );

    expect(avec2).toBe(7);
    expect(avec10).toBe(12);
    // Le prochain objectif est TOUJOURS visible : la fenêtre dépasse toujours
    // les acquis de deux.
    expect(avec10).toBeGreaterThan(10);
  });

  test('affiche le compte ACQUIS sur ATTEIGNABLE, jamais sur le total déclaré', () => {
    // Promettre un dénominateur qu'on ne peut pas atteindre découragerait pour
    // rien : le total est celui du réel.
    const rendu = rendreAvecDefis({ reach: { 'conversation.join.size': 300 } });
    expect(rendu).toContain('Cercles');
    expect(rendu).not.toContain('/ 0');
  });
});
