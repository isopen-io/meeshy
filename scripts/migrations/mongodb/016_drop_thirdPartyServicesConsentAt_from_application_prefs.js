/**
 * #4343 — retirer `application.thirdPartyServicesConsentAt` du blob de
 * préférences. Plus aucun code ne le lit.
 *
 * ## Pourquoi il est là
 *
 * Aucune route ne l'a jamais écrit, et `ApplicationPreferenceSchema` ne le
 * déclare pas — un client qui le soumet le voit stripper par Zod. Il vient
 * d'une migration : `enable_audio_features_in_preferences.js` l'a posé par un
 * `updateMany({})` en janvier 2026, sur CHAQUE ligne existante.
 *
 * Mesuré sur staging le 2026-08-31 : 207 lignes sur 207 le portent, pour 223
 * comptes. `ConsentValidationService` en dérivait `hasThirdPartyServicesConsent`
 * — la garde PASSAIT donc pour les comptes dotés d'une ligne et REFUSAIT les
 * 16 sans ligne. Un verdict de consentement qui dépend de la date de la ligne,
 * jamais d'un consentement donné.
 *
 * ## Pourquoi le retirer plutôt que le laisser
 *
 * C'est un horodatage qui RESSEMBLE à un consentement, dans un blob que les
 * préférences relisent à chaque écriture. Le laisser, c'est laisser la
 * prochaine lecture le reprendre pour ce qu'il n'est pas — la forme exacte du
 * défaut que #4180 avait fermé sur les cinq clés voisines, où le blob faisait
 * autorité contre la colonne `User`.
 *
 * ## Sûreté
 *
 * `$unset` pur : aucune autre clé n'est touchée, aucune ligne n'est créée ni
 * supprimée. Idempotent — rejouable sans effet sur une base déjà migrée.
 *
 * Usage :
 *   docker exec meeshy-database-staging mongosh meeshy \
 *     --file /chemin/016_drop_thirdPartyServicesConsentAt_from_application_prefs.js
 */

const COLLECTION = 'user_preferences';
const CHAMP = 'application.thirdPartyServicesConsentAt';

const avant = db.getCollection(COLLECTION).countDocuments({ [CHAMP]: { $exists: true } });
print(`[016] lignes portant ${CHAMP} : ${avant}`);

if (avant === 0) {
  print('[016] rien à faire — déjà migré.');
} else {
  const res = db.getCollection(COLLECTION).updateMany(
    { [CHAMP]: { $exists: true } },
    { $unset: { [CHAMP]: '' } }
  );
  print(`[016] modifiées : ${res.modifiedCount}`);
}

const apres = db.getCollection(COLLECTION).countDocuments({ [CHAMP]: { $exists: true } });
print(`[016] restantes : ${apres}`);
if (apres !== 0) {
  throw new Error(`[016] ÉCHEC — ${apres} lignes portent encore ${CHAMP}`);
}
print('[016] OK');
