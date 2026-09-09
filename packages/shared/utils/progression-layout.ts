import type { EngagementProgress } from './engagement-progress.js';

/**
 * LA COMPOSITION DE L'ÉCRAN « PROGRESSION » — déclarée UNE fois (#5838).
 *
 * ## Pourquoi ce fichier existe
 *
 * `resolveEngagementProgress()` décide de ce que l'écran MONTRE ; personne ne
 * décidait de l'ORDRE dans lequel il le montre. Chaque client a donc composé le
 * sien, et les deux ont divergé sans qu'aucun témoin ne rougisse :
 *
 * | client | ordre |
 * |---|---|
 * | iOS natif | Meesh → badges → succès → défis |
 * | web-v3 | élan → Meesh → niveau/série → défis → badges → succès |
 *
 * Deux jumelles pour un écran, ce que le CLAUDE.md interdit. La divergence
 * n'était pas détectable par un témoin par client : chacun listait SES sections
 * et passait au vert sur SON ordre. Ce qui manquait n'était pas un test de
 * plus, c'était un endroit où l'ordre soit ÉCRIT.
 *
 * ## Ce que ce type est, et n'est pas
 *
 * Il déclare la SÉQUENCE, pas le rendu : ni taille, ni couleur, ni icône — ces
 * choix restent à chaque plateforme, qui n'a pas les mêmes idiomes. Ce qui doit
 * être commun est ce que l'utilisateur RETROUVE : le même bloc à la même place,
 * quel que soit l'appareil (dimension 6, cohérence de positionnement).
 */

/** Les trois destinations dédiées, dans l'ordre où le hub les propose. */
export const PROGRESSION_SECTIONS = ['badges', 'defis', 'succes'] as const;

export type ProgressionSection = (typeof PROGRESSION_SECTIONS)[number];

/**
 * Un bloc du hub.
 *
 * Type SOMME et non un tableau de chaînes : une entrée de section porte laquelle
 * — et le compilateur refuse alors qu'on l'oublie chez un client, ce qu'une
 * chaîne libre aurait laissé passer.
 */
export type ProgressionBlock =
  /**
   * Le DERNIER succès décroché, et non le prochain.
   *
   * Le prochain aurait demandé une DISTANCE — « encore 2 » — et cette distance
   * n'existe nulle part : `AchievementEntry` ne porte qu'un booléen, et les
   * compteurs servis sont par AXE quand les défis sont par FAMILLE, sans pont
   * entre les deux espaces de noms. Le serveur sait compter, mais sur le chemin
   * d'événement, et jette le résultat (#5840).
   *
   * Le dernier décroché, lui, se lit dans ce qui est DÉJÀ servi : le `reachedAt`
   * des paliers gravés. Un bloc qui dit vrai avec la donnée d'aujourd'hui vaut
   * mieux qu'un bloc juste qui attend une migration.
   */
  | { readonly kind: 'last-achievement' }
  | { readonly kind: 'level' }
  | { readonly kind: 'elans' }
  | { readonly kind: 'section-link'; readonly section: ProgressionSection };

/**
 * La séquence du hub pour une progression donnée.
 *
 * Les trois heros sont TOUJOURS servis, y compris sur un compte vide : un écran
 * neuf doit expliquer ce qu'on peut y gagner, pas se taire. C'est le contraire
 * du réflexe « pas de données, pas de bloc », qui produit un premier lancement
 * muet — le moment où l'utilisateur a le plus besoin qu'on lui parle.
 */
export function progressionLayout(progress: EngagementProgress): readonly ProgressionBlock[] {
  /**
   * La porte des DÉFIS n'existe que si la passerelle sert la carte
   * d'atteignabilité. Sans elle, l'entrée annoncerait « 0 / 0 » et mènerait à
   * une page vide : une porte qui ne va nulle part est pire qu'une porte
   * absente, parce qu'elle se lit comme une panne. Badges et Succès, eux, sont
   * TOUJOURS servis : leur catalogue est une constante partagée, jamais une
   * mesure du serveur.
   *
   * La règle porte sur le fait qu'il Y AIT des sections, pas sur la présence de
   * la carte : c'est la seule formulation que le miroir Swift peut reproduire à
   * l'identique, son modèle collapsant « absente » et « vide » en un tableau
   * vide. Une règle qu'un miroir ne peut pas dire est une divergence en
   * attente.
   *
   * (Ce que « carte absente » doit vouloir dire au juste est une décision
   * produit ouverte — #5829. Ici on refuse simplement de promettre du vide.)
   */
  const sections = PROGRESSION_SECTIONS.filter(
    (section) => section !== 'defis' || (progress.achievementSections ?? []).length > 0,
  );

  return [
    { kind: 'last-achievement' },
    { kind: 'level' },
    { kind: 'elans' },
    ...sections.map((section) => ({ kind: 'section-link', section }) as const),
  ];
}

/**
 * Ce que le hero du dernier succès montre : le palier gravé le PLUS RÉCEMMENT,
 * toutes provenances confondues.
 *
 * Deux familles de succès coexistent et le hero ne doit pas choisir entre elles :
 * les cinq succès COMPOSÉS nommés un par un (#5530) et les paliers produits par
 * la grammaire (#5758). L'utilisateur ne connaît pas cette distinction — il a
 * décroché quelque chose, il veut le revoir.
 *
 * `null` quand rien n'a jamais été décroché : le hero dit alors ce qu'on peut
 * viser, il ne disparaît pas. Une section qui s'efface sur un compte neuf est
 * précisément ce qui rend un premier lancement muet.
 */
export type LastAchievement =
  | { readonly kind: 'named'; readonly key: string; readonly reachedAt: string }
  | { readonly kind: 'generated'; readonly key: string; readonly reachedAt: string };

export function lastAchievement(progress: EngagementProgress): LastAchievement | null {
  const candidats: LastAchievement[] = [];

  for (const succes of progress.achievements) {
    if (succes.unlocked && succes.reachedAt !== null) {
      candidats.push({ kind: 'named', key: succes.key, reachedAt: succes.reachedAt });
    }
  }

  for (const section of progress.achievementSections ?? []) {
    for (const entree of section.entries) {
      if (entree.unlocked && entree.reachedAt !== null) {
        candidats.push({ kind: 'generated', key: entree.key, reachedAt: entree.reachedAt });
      }
    }
  }

  // Une date ILLISIBLE ne gagne pas par accident : `NaN` perdrait toute
  // comparaison en silence et laisserait remonter un candidat arbitraire.
  const datables = candidats.filter((c) => Number.isFinite(new Date(c.reachedAt).getTime()));
  if (datables.length === 0) return null;

  return datables.reduce((plusRecent, candidat) =>
    new Date(candidat.reachedAt).getTime() > new Date(plusRecent.reachedAt).getTime()
      ? candidat
      : plusRecent,
  );
}
