import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { adresseDuMessageAncre } from '@/lib/api/adresses-du-fil';
import type { Message } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';

/**
 * LE BANDEAU DES MESSAGES ÉPINGLÉS (§ 12.10.1, issue #5385) — en tête du fil,
 * MEMBRE SEUL (`etat.fil.epingles` n'est jamais peuplé pour l'invité,
 * `lib/api/fil.ts` › `fil()` : la passerelle refuse `GET .../pinned-messages`
 * à un anonyme). Aucun message épinglé, rien ne se rend — la même règle que
 * `avisLienCree`/`bandeauxDifferes` (charte règle 7).
 *
 * UN SEUL LIEN, VERS LE PLUS RÉCEMMENT ÉPINGLÉ (`epingles[0]`, l'ordre que sert
 * `GET .../pinned-messages`), avec le COMPTE de tous — le patron du bandeau de
 * WhatsApp, jamais un accordéon : le « chemin pauvre » de #5385 (aucune
 * dépendance à un module). `adresseDuMessageAncre` sert la même composition
 * que le retour du plein écran — la tranche qui contient le message, cadrée
 * dessus — pour qu'un message épinglé, si ancien soit-il, reste ATTEIGNABLE.
 *
 * `.bandeau .entete` réutilise la mise en page du bandeau des droits
 * (`fil-feuille.ts`) : icône, titre, sous-titre — aucun octet de CSS de plus.
 */
export const bandeauDesEpingles = (epingles: readonly Message[], adresse: string): string => {
  if (epingles.length === 0) return '';
  const recent = epingles[0]!;
  return (
    `<a class="bandeau epingles" href="${echappe(adresseDuMessageAncre(adresse, recent.id))}">` +
    `<span class="entete">${svgDuSprite('ph-push-pin')}` +
    `<div><b>${echappe(FIL.messageEpingle(epingles.length))}</b><p>${echappe(recent.texte)}</p></div>` +
    '</span></a>'
  );
};
