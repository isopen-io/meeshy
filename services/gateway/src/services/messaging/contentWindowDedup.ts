/**
 * **Déduplication de REPLI : le même contenu, du même expéditeur, dans la même
 * conversation, à quelques secondes d'intervalle** (#6910).
 *
 * ### Ce que ce module garde, et pourquoi il ne suffit pas
 *
 * La déduplication NOMINALE est `(conversationId, clientMessageId)` — contrainte
 * unique partielle MongoDB, INSERT direct + rattrapage P2002 dans
 * `MessageProcessor`. Elle est correcte, et **elle fonctionne** : mesurée vivante
 * en production (`Idempotent dedup hit on clientMessageId`). Elle a un angle mort
 * unique, et c'est celui que ce module couvre : **un producteur qui REFABRIQUE sa
 * clé à chaque ré-émission.** La clé neuve ne peut par construction matcher
 * aucune ligne — la contrainte n'a rien à reconnaître, et une ligne de plus est
 * écrite.
 *
 * Mesuré en production le 2026-09-17 : sur les 28 groupes de messages dupliqués
 * des 7 derniers jours, **0 partageaient une clé et 28 en portaient une par
 * copie**. Le défaut est donc une RE-CLÉ, jamais un contournement de la garde.
 *
 * ### C'est un PALLIATIF, et il se dit tel
 *
 * Il ne corrige pas la cause (le client qui re-clé) : il empêche le symptôme
 * d'atteindre les utilisateurs pendant que la cause se traite, parce qu'un
 * correctif client iOS passe par l'App Store et met des jours à arriver. La
 * cause a sa propre issue.
 *
 * ### La fenêtre se choisit sur la MESURE, jamais au jugé
 *
 * Distribution des écarts entre deux messages de contenu identique (même
 * expéditeur, même conversation), 7 jours de production, 169 mesures :
 * **médiane 197 s, p75 7,9 h** — les gens répètent vraiment le même texte, et le
 * dédupliquer largement AVALERAIT des messages légitimes. Un palliatif qui
 * mange un vrai message est pire que le défaut qu'il corrige.
 *
 * Le gain s'aplatit vite, et le risque croît en face :
 *
 * | fenêtre | copies rattrapées (24 h) |
 * |---|---|
 * | 1 s | 14 |
 * | **2 s** | **17** |
 * | 5 s | 22 |
 * | 30 s | 28 |
 *
 * `2 s` retient les rafales — 3 à 5 copies en 75–100 ms, qu'aucun humain ne
 * produit — et reste loin de l'intervalle où répéter un texte redevient un
 * geste humain plausible. Elle prolonge la règle que les DEUX clients déclarent
 * déjà pour eux-mêmes (`DEBOUNCE_MS = 600` côté web-v2,
 * `duplicateSendDebounce = 0.6` côté iOS) : ce module ne l'invente pas, il la
 * porte côté serveur où elle survit à une instance de vue recréée, et l'élargit
 * de la gigue réseau entre le geste et l'arrivée.
 *
 * ### Un contenu VIDE ne se déduplique JAMAIS
 *
 * Deux photos DISTINCTES portent toutes les deux `content: ''`. Les dédupliquer
 * entre elles ferait disparaître une vraie pièce jointe — exactement le défaut
 * que web-v2 a déjà rencontré et réglé par une signature de pièces
 * (`attachmentsSignatureOf`, #5668). Ici la réponse est plus simple et plus
 * sûre : **hors fenêtre d'éligibilité.** Un message sans texte est rendu à la
 * garde nominale `clientMessageId`, et à elle seule.
 */

export const CONTENT_WINDOW_DEDUP_MS = 2000;

export type ContentWindowCandidate = {
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
};

/**
 * Un candidat est ÉLIGIBLE au repli quand son contenu porte du texte. Pure,
 * donc testable sans base — et c'est la moitié du module qui doit l'être, la
 * seconde n'étant qu'une requête.
 */
export function isContentWindowDedupEligible(candidate: ContentWindowCandidate): boolean {
  return candidate.content.trim().length > 0;
}
