import type { GuideAction, GuideMoment, OnboardingStep } from '@meeshy/shared/utils/game/guide';

import { LEVEL_TIER_NAMES, TREASURY_NAMES, formatCount, meeshCount, pointsLabel, rankLabel } from './game-copy';

/**
 * CE QUE DISENT MEE ET MEO (#9379) — conception, partie III. Chaque
 * intervention suit la même structure :
 *
 *   Ce qui vient d'arriver → Ce que ça veut dire → L'étape d'après → Un bouton
 *
 * La loi partagée (`@meeshy/shared/utils/game/guide`) choisit le MOMENT et
 * rend ses chiffres ; elle ne prononce rien. Ce fichier l'habille, comme
 * `mascot-copy.ts` pour l'ancienne mascotte : au tutoiement (ce sont des
 * compagnons), sans bulle, avec une version COURTE pour les fois suivantes.
 *
 * DETTE NOMMÉE, la même que `game-copy.ts` : l'écran Progression n'appelle pas
 * encore `translate()`, cette copie est en français seul. Les clés de moments
 * et d'actions sont stables ; le jour du catalogue, chaque phrase devient une
 * clé et l'accord passe déjà par `Intl.PluralRules` (`game-copy.ts`).
 */

export type GuideCopy = {
  /** Ce qui vient d'arriver — la ligne forte. */
  readonly what: string;
  /** Ce que ça veut dire — la règle. */
  readonly means: string;
  /** L'étape d'après. */
  readonly next: string;
  /** La version d'UNE ligne, pour les fois suivantes. */
  readonly short: string;
  /** Le libellé du bouton qui y mène. */
  readonly action: string;
};

export const ACTION_LABELS: Readonly<Record<GuideAction, string>> = {
  'start-game': 'Commencer le jeu',
  'earn-first-points': 'Faire mon premier geste',
  'see-level': 'Voir mon niveau',
  'see-missions': 'Voir les missions',
  'see-flame': 'Voir ma Flamme',
  'see-meeshes': 'Voir les Meeshes',
  'see-rank': 'Voir mon rang',
  'take-start-photo': 'Prendre la photo de départ',
  'see-progress': 'Voir ma progression',
  'see-next-tier': 'Voir le palier suivant',
  'open-first-mission': 'Ouvrir ma première mission',
  'mint-or-climb': 'Voir l’aperçu de frappe',
  'regain-levels': 'Reprendre mes niveaux',
  'relight-badge': 'Voir mes badges',
  'see-mint-preview': 'Voir l’aperçu de frappe',
  'take-photo': 'Immortaliser ce moment',
  'keep-or-spend': 'Voir mon trésor',
  'do-easy-mission-or-freeze': 'Voir mes missions',
  'relight-flame': 'Rallumer la Flamme',
  'do-easiest-mission': 'Voir la mission la plus facile',
  'prestige-or-stay': 'Voir mon niveau',
};

const plural = new Intl.PluralRules('fr-FR');
const one = (count: number): boolean => plural.select(count) === 'one';

const actions = (count: number): string => (one(count) ? `${count} action` : `${count} actions`);
const days = (count: number): string => (one(count) ? `${count} jour` : `${count} jours`);

const copy = (action: GuideAction, parts: Omit<GuideCopy, 'action'>): GuideCopy => ({ ...parts, action: ACTION_LABELS[action] });

export function momentCopy(moment: GuideMoment): GuideCopy {
  switch (moment.key) {
    case 'first-level': {
      const { level, pointsToNext } = moment.data;
      return copy(moment.action, {
        what: 'Ton premier niveau est gagné.',
        means: 'Tes points remplissent l’anneau : quand il est plein, tu montes d’un niveau.',
        next: `Encore ${pointsLabel(pointsToNext)} pour le niveau ${level + 1}.`,
        short: `Niveau ${level} : encore ${pointsLabel(pointsToNext)} pour le suivant.`,
      });
    }
    case 'new-tier': {
      const { tier, nextTierLevel } = moment.data;
      return copy(moment.action, {
        what: `Tu entres dans ${LEVEL_TIER_NAMES[tier]} !`,
        means: 'Les paliers jalonnent ta route : dix niveaux chacun.',
        next: nextTierLevel === null ? 'Tu es au dernier palier.' : `Le palier suivant s’ouvre au niveau ${nextTierLevel}.`,
        short: `Palier ${LEVEL_TIER_NAMES[tier]} atteint.`,
      });
    }
    case 'missions-unlocked':
      return copy(moment.action, {
        what: 'Les missions sont débloquées.',
        means: 'Trois missions par jour, et un coffre à ouvrir quand elles sont faites.',
        next: 'Ouvre ta première mission.',
        short: 'Tes missions du jour t’attendent.',
      });
    case 'first-mint-possible': {
      const { price, levelsLost, gloryGain } = moment.data;
      return copy(moment.action, {
        what: 'Tu peux frapper ta première Meesh.',
        means:
          levelsLost === 0
            ? `Frapper coûte ${pointsLabel(price)}, sans te faire perdre un niveau, et rapporte +${formatCount(gloryGain)} de Gloire.`
            : `Frapper coûte ${pointsLabel(price)}, soit ${levelsLost === 1 ? '1 niveau,' : `${levelsLost} niveaux,`} et rapporte +${formatCount(gloryGain)} de Gloire.`,
        next: 'Frappe maintenant, ou grimpe d’abord.',
        short: `Une Meesh se frappe pour ${pointsLabel(price)}.`,
      });
    }
    case 'first-mint': {
      const { levelBefore, levelAfter, tailwindUntilLevel } = moment.data;
      return copy(moment.action, {
        what: 'Tchak ! Ta première Meesh est frappée.',
        means: `Ton niveau est passé de ${levelBefore} à ${levelAfter} : c’est la règle. Le Vent arrière est actif.`,
        next: `Reprends tes niveaux plus vite : tes points comptent 25 % de plus jusqu’au niveau ${tailwindUntilLevel}.`,
        short: `Niveau ${levelBefore} → ${levelAfter}. Le Vent arrière t’aide jusqu’au niveau ${tailwindUntilLevel}.`,
      });
    }
    case 'badge-extinguished': {
      const { missingActions } = moment.data;
      return copy(moment.action, {
        what: 'Un badge s’est éteint.',
        means: 'Il est devenu une empreinte : rien n’est perdu pour toujours.',
        next: `Encore ${actions(missingActions)} pour le rallumer.`,
        short: `Un badge s’est éteint : ${actions(missingActions)} pour le rallumer.`,
      });
    }
    case 'price-rises': {
      const { nextPrice } = moment.data;
      return copy(moment.action, {
        what: 'Les Meeshes deviennent plus rares.',
        means: 'Plus on en frappe, plus la suivante coûte.',
        next: `La prochaine coûte ${pointsLabel(nextPrice)}.`,
        short: `La prochaine Meesh coûte ${pointsLabel(nextPrice)}.`,
      });
    }
    case 'new-rank': {
      const { rank, division, gloryMissing } = moment.data;
      const name = rankLabel(rank, division);
      return copy(moment.action, {
        what: `Nouveau rang : ${name}.`,
        means: 'Ta Gloire a passé un seuil, et elle ne redescend pas.',
        next:
          gloryMissing === null
            ? 'C’est le rang le plus haut. Immortalise ce moment.'
            : `Encore ${formatCount(gloryMissing)} de Gloire pour la division suivante. Immortalise ce moment.`,
        short: `Tu es ${name}.`,
      });
    }
    case 'treasury-tier': {
      const { tier, nextTierMissing } = moment.data;
      return copy(moment.action, {
        what: `Ton trésor atteint le palier ${TREASURY_NAMES[tier]}.`,
        means: 'Ton trésor est visible sur ton profil.',
        next:
          nextTierMissing === null
            ? 'Garde-le, ou dépense tes Meeshes.'
            : `Garde ${meeshCount(nextTierMissing)} de plus pour le palier suivant, ou dépense.`,
        short: `Trésor : palier ${TREASURY_NAMES[tier]}.`,
      });
    }
    case 'flame-at-risk': {
      const { days: streak } = moment.data;
      return copy(moment.action, {
        what: 'Ta Flamme est en danger.',
        means: `Elle s’éteint à minuit si tu ne fais aucun geste : ${days(streak)} de série à sauver.`,
        next: 'Fais une mission facile, ou achète un gel.',
        short: 'Ta Flamme s’éteint à minuit : un geste suffit.',
      });
    }
    case 'flame-out': {
      const { relightPrice, canRelight } = moment.data;
      return copy(moment.action, {
        what: 'Ta Flamme s’est éteinte.',
        means: 'Le Bonus de Flamme repart à zéro.',
        next: canRelight
          ? `Rallume-la sous 48 h pour ${meeshCount(relightPrice)}.`
          : 'Ton prochain geste en allume une nouvelle.',
        short: canRelight ? `Flamme éteinte : rallume-la pour ${meeshCount(relightPrice)}.` : 'Flamme éteinte : un nouveau geste la rallume.',
      });
    }
    case 'return-after-absence': {
      const { daysAway } = moment.data;
      return copy(moment.action, {
        what: 'Content de te revoir !',
        means: `Tu étais parti ${days(daysAway)} : ton rang, ton trésor et ta Gloire sont restés là où tu les as laissés.`,
        next: 'Commence par la mission la plus facile du jour.',
        short: 'Bon retour : commence par la mission la plus facile.',
      });
    }
    case 'level-100':
      return copy(moment.action, {
        what: 'Niveau 100 : tu es au sommet !',
        means: 'Le Prestige remet ton niveau à 1 et te donne une étoile et un trophée.',
        next: moment.data.canPrestige ? 'Passe en Prestige, ou reste au sommet.' : 'Reste au sommet autant que tu veux.',
        short: 'Tu es au sommet.',
      });
  }
}

const STEP_COPY: Readonly<Record<OnboardingStep['key'], Omit<GuideCopy, 'action' | 'short'>>> = {
  welcome: {
    what: 'Salut, c’est Mee ! Avec Meo, on t’explique le jeu en sept cartes.',
    means: 'Chaque geste utile rapporte des points : écrire, parler, publier, réagir, inviter.',
    next: 'Fais ton premier geste, je compte tes points.',
  },
  'first-points': {
    what: 'Bravo, tes premiers points !',
    means: 'Les points font le niveau : ils remplissent ton anneau.',
    next: 'Regarde ton anneau se remplir.',
  },
  levels: {
    what: 'Cent niveaux, dix paliers.',
    means: 'Chaque niveau demande un peu plus de points que le précédent.',
    next: 'Les missions s’ouvrent au niveau 5.',
  },
  missions: {
    what: 'Chaque jour, trois missions et un coffre.',
    means: 'Fais-les pour ouvrir le coffre et nourrir ta Flamme.',
    next: 'Une Flamme grandit tant que tu reviens.',
  },
  flame: {
    what: 'Ta Flamme grandit chaque jour où tu agis.',
    means: 'Chaque jour de série ajoute 2 % à tes récompenses de mission, jusqu’à 50 %. Un gel couvre un jour manqué.',
    next: 'Tes points peuvent devenir des Meeshes.',
  },
  mint: {
    what: 'À partir de 1 221 points, on frappe une Meesh.',
    means: 'Les points dépensés quittent ton niveau, mais ton rang ne baisse jamais : chaque frappe ajoute de la Gloire.',
    next: 'La Gloire donne le rang.',
  },
  rank: {
    what: 'Ton rang ne baisse jamais.',
    means: 'Frapper, battre des records, décrocher des succès : tout ajoute de la Gloire.',
    next: 'Immortalisons ton départ en photo.',
  },
};

/** Ce que dit l'étape qui ATTEND son geste : elle nomme le geste, pas la rubrique suivante. */
const AWAITING_NEXT: Readonly<Partial<Record<OnboardingStep['key'], string>>> = {
  missions: 'Fais la mission la plus facile du jour : je t’attends pour la suite.',
  flame: 'Reviens demain et fais un geste : ta série passera à 2 jours.',
};

export function stepCopy(
  step: OnboardingStep,
  options: { readonly awaiting?: boolean; readonly action?: GuideAction } = {},
): GuideCopy {
  const parts = STEP_COPY[step.key];
  const next = options.awaiting === true ? (AWAITING_NEXT[step.key] ?? parts.next) : parts.next;
  return { ...parts, next, short: parts.what, action: ACTION_LABELS[options.action ?? step.action] };
}

export type GameRule = { readonly index: number; readonly title: string; readonly body: string };

const rule = (index: number, title: string, body: string): GameRule => ({ index, title, body });

/** Les huit règles en une page (conception, partie I) — le carnet que le joueur retrouve. */
export const GAME_RULES: readonly GameRule[] = [
  rule(1, 'Chaque geste rapporte', 'Écrire, parler, publier, réagir, inviter : chaque action utile donne des points.'),
  rule(2, 'Les points font le niveau', '100 niveaux en 10 paliers. Chaque niveau demande un peu plus que le précédent.'),
  rule(3, 'On frappe des Meeshes', 'À partir de 1 221 points, on frappe une Meesh à la main. Le prix monte avec le nombre de Meeshes déjà frappées.'),
  rule(4, 'Frapper fait redescendre', 'Les points dépensés quittent le niveau. Les badges qu’ils tenaient peuvent s’éteindre.'),
  rule(5, 'Le rang ne baisse jamais', 'Chaque frappe, chaque record, chaque succès ajoute de la Gloire. La Gloire donne le rang.'),
  rule(6, 'Le trésor se garde ou se dépense', 'Garder ses Meeshes fait monter le trésor. Les dépenser protège la Flamme ou offre des cosmétiques.'),
  rule(7, 'Chaque jour compte', 'Trois missions, un coffre, une Flamme qui grandit tant qu’on revient.'),
  rule(8, 'On garde une trace', 'Chaque grand moment se photographie avec Mee et Meo dans le carnet de progression.'),
];
