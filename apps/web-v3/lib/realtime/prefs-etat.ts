import type { CleDePreference } from '@/lib/contenu/prefs-de-notif';

/**
 * L'ÉTAT PUR DE LA BASCULE OPTIMISTE (`/notifications/preferences`, #4899,
 * spécification § 3, § 4 étape 6) — sans DOM, sans réseau : séparé de
 * `lib/realtime/prefs.ts` pour la même raison que `feed-etat.ts` l'est de
 * `feed.ts` (`lib/realtime/feed-etat.ts`, doc-comment de tête) — un module qui
 * touche le DOM s'auto-exécute à l'import et n'a donc pas de témoin unitaire
 * pratique.
 *
 * TROIS FONCTIONS, TROIS MOMENTS DU GESTE :
 *
 *   1. `bascule` — AVANT le réseau : peint l'inverse tout de suite (Instant
 *      App Principles, `CLAUDE.md`), et dit la mutation à envoyer ;
 *   2. `reconcilie` — APRÈS une réponse SERVIE : LE SERVEUR GAGNE, même s'il
 *      diverge de l'optimiste (un consentement manquant, un autre appareil
 *      qui a écrit entretemps) — jamais un second calcul local ;
 *   3. `annule` — APRÈS un ÉCHEC réseau : restaure la valeur d'avant, et le
 *      rollback est un ÉTAT (`echec: true`), donc VISIBLE — la loi du critère
 *      de fin (« jamais un état affiché divergent du serveur »).
 */

/**
 * PARTIEL, DÉLIBÉRÉMENT : la vue (`prefs-vue.ts`) tient les TREIZE clés — elle
 * doit rendre chaque rangée —, mais ce module pur sert AUSSI le module de
 * navigateur (`prefs.ts`), qui ne connaît QU'UNE rangée à la fois (celle du
 * formulaire soumis). Une signature à treize clés obligatoires aurait forcé
 * une valeur assertion (`as Record<…>`) à l'appel — interdite par la charte
 * TypeScript (`CLAUDE.md`, « No type assertions without justification »).
 */
export type EtatDePrefs = {
  readonly reglages: Readonly<Partial<Record<CleDePreference, boolean>>>;
};

export type MutationDePrefs = {
  readonly cle: CleDePreference;
  readonly valeur: boolean;
};

export const bascule = (
  etat: EtatDePrefs,
  cle: CleDePreference,
): { readonly etat: EtatDePrefs; readonly mutation: MutationDePrefs } => {
  const valeur = !etat.reglages[cle];
  return {
    etat: { reglages: { ...etat.reglages, [cle]: valeur } },
    mutation: { cle, valeur },
  };
};

/** LE SERVEUR GAGNE — le document RELU remplace l'état local, en bloc. */
export const reconcilie = (
  etat: EtatDePrefs,
  document: Readonly<Record<string, boolean>>,
): EtatDePrefs => ({ reglages: { ...etat.reglages, ...document } });

export const annule = (
  etat: EtatDePrefs,
  cle: CleDePreference,
  valeurAvant: boolean,
): { readonly etat: EtatDePrefs; readonly echec: true } => ({
  etat: { reglages: { ...etat.reglages, [cle]: valeurAvant } },
  echec: true,
});
