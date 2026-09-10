/**
 * LES MARQUEURS DE FIXTURE — noms qui ne doivent JAMAIS apparaître dans un
 * dist construit en `VITE_DATA_SOURCE=gateway` (#5815, leçon 554 : une
 * capture peut montrer web-v3 sur ses fixtures sans que rien ne le dise).
 *
 * Noms de personnes tirés de `src/lib/api/fixtures-base.ts` (Amina Diallo,
 * Kwame Mensah, Fatou Bâ) et de l'identifiant du lecteur de fixture
 * (`VIEWER_ID = 'u-viewer'`). La mesure manuelle de D-26 F9
 * (`grep -c "Amina\|Kwame\|Fatou\|u-viewer" dist/assets/*.js` = 0) devient
 * une DONNÉE partagée plutôt qu'une chaîne recopiée à chaque site qui en a
 * besoin (leçon 551 : un réglage écrit à plusieurs endroits finit écrit de
 * plusieurs façons). `scripts/check-gateway-build.mjs` pourra l'adopter —
 * hors périmètre de #5815, non modifié ici.
 */
export const FIXTURE_MARKERS = Object.freeze(['Amina', 'Kwame', 'Fatou', 'u-viewer']);
