/**
 * Le vocabulaire des consentements — **un seul site pour les deux côtés de la
 * frontière de confiance** (#4487, suite de #4348).
 *
 * ## Le défaut que ce fichier ferme
 *
 * `PUT /me/consents/{purpose}` EXIGE que le client cite la version de politique
 * en vigueur, et répond **409** sur toute autre valeur. C'est le bon régime :
 * un client qui accepterait une politique périmée ne consentirait pas à celle
 * qui compte.
 *
 * Mais les deux côtés tenaient la valeur SÉPARÉMENT — `process.env.CONSENT_POLICY_VERSION
 * ?? '2026-08-30'` côté passerelle, `'2026-08-30'` écrit en dur côté web. **Tout
 * déploiement qui pose l'override transforme chaque écriture unifiée du web en
 * 409** — avalé par un `console.warn`, donc l'utilisateur voit un succès pendant
 * que le miroir n'est jamais écrit. Et aucun témoin ne pouvait l'attraper :
 * celui du web épinglait `expect.any(String)`, jamais la valeur.
 *
 * > Une valeur qui traverse une frontière et n'a pas de site unique finit par
 * > diverger. Ce n'est pas une question de discipline : les deux côtés ne sont
 * > pas relus le même jour, et rien ne les compare.
 *
 * ## Ce que ce fichier NE fait pas
 *
 * Il ne lit aucune variable d'environnement. La passerelle garde le droit de
 * surcharger la version à l'exécution — c'est elle qui SERT la politique, et
 * elle seule sait laquelle est en vigueur. Ce que le partagé porte est le
 * DÉFAUT, celui que le web cite tant que rien ne le contredit, et que le
 * serveur confirme ou refuse. Le client ne devine pas ; il propose, et le 409
 * le corrige.
 */

/**
 * Les CINQ `purpose` (#4709 a ajouté `analytics`). Avant #4709, une chaîne
 * UNIQUE (`data-processing → voice-data → voice-profile → voice-cloning`)
 * laissait `ancestorsOf()` calculer les ancêtres par un simple PRÉFIXE du
 * tableau — un slice qui suppose un ORDRE TOTAL. `analytics` casse cette
 * hypothèse : c'est un second enfant de `data-processing`, pas un maillon de
 * plus dans la chaîne vocale, et un slice l'aurait rendu ancêtre de
 * `voice-data` (ou l'inverse, selon sa position) sans qu'aucun des deux ne
 * dépende réellement de l'autre. `CONSENT_PARENT` ci-dessous porte donc la
 * hiérarchie RÉELLE — un arbre, pas une chaîne — et cet ordre du tableau ne
 * sert plus qu'à l'AFFICHAGE (`GET /me/consents`, `allowedPurposes`).
 */
export const CONSENT_PURPOSES = [
  'data-processing',
  'analytics',
  'voice-data',
  'voice-profile',
  'voice-cloning',
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * Le PARENT DIRECT de chaque `purpose`, `null` pour la racine — la source
 * unique de la hiérarchie depuis #4709. `analytics` et `voice-data` sont
 * tous deux enfants de `data-processing` et ne dépendent pas l'un de
 * l'autre ; `voice-profile` et `voice-cloning` restent la chaîne vocale
 * historique. Un consommateur qui a besoin des ANCÊTRES d'un `purpose`
 * remonte cette carte (voir `ancestorsOf` dans `routes/me/consents.ts`) —
 * il ne doit plus jamais découper `CONSENT_PURPOSES` par préfixe.
 */
export const CONSENT_PARENT: Readonly<Record<ConsentPurpose, ConsentPurpose | null>> = {
  'data-processing': null,
  analytics: 'data-processing',
  'voice-data': 'data-processing',
  'voice-profile': 'voice-data',
  'voice-cloning': 'voice-profile',
};

/**
 * La politique par DÉFAUT. La passerelle peut la surcharger par
 * `CONSENT_POLICY_VERSION` ; le client cite celle-ci et se fait corriger par un
 * 409 s'il se trompe.
 */
export const CONSENT_POLICY_VERSION_DEFAULT = '2026-08-30';

/** Vrai si la valeur est l'un des quatre `purpose` — la seule porte d'entrée. */
export function isConsentPurpose(value: string): value is ConsentPurpose {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}
