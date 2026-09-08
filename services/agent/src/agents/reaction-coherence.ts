import type { PendingReaction } from '../graph/state';

/**
 * Le garde de COHÉRENCE des réactions de l'agent.
 *
 * ## Pourquoi il existe
 *
 * Les messages passaient par le QualityGate ; les réactions, non — le journal
 * le disait sans que personne le lise : `Validated 2/5 messages, 5 reactions
 * pass-through`. Le strategist reçoit pourtant la consigne « emojis courants et
 * pertinents au message cible », mais RIEN ne vérifiait qu'il l'avait suivie.
 *
 * Mesuré en production le 2026-09-08 (conversation `68f2a814…`) : le message
 * « D'accord » — deux mots, un acquiescement — portait un 🤔, et deux agents
 * distincts y avaient posé 🙌 à la même minute (#5666).
 *
 * ## Pourquoi déterministe, et non un appel au modèle
 *
 * Le QualityGate interroge le modèle par message et, en cas d'erreur, laisse
 * passer (`allowing message through`). Ce repli est acceptable pour juger une
 * NUANCE de style ; il ne l'est pas pour un contresens, où l'échec silencieux
 * rendrait le garde inutile précisément quand il servirait. Ces règles-ci sont
 * donc lisibles, testables une par une, sans coût ni latence.
 *
 * Le parti pris est la PRUDENCE : on ne refuse que ce qu'on sait nommer. Un
 * emoji inconnu du garde, un contenu absent ou un média sans texte passent —
 * mieux vaut laisser filer une réaction douteuse que d'en bloquer une juste.
 */

export type VerdictReaction = { ok: true } | { ok: false; reason: string };

/** Emojis qui expriment le DOUTE, l'interrogation ou la réserve. */
const EMOJIS_DOUTE = new Set(['🤔', '😕', '🤨', '❓', '❔', '🤷', '😬', '😐']);

/** Emojis qui expriment la TRISTESSE ou la peine. */
const EMOJIS_TRISTESSE = new Set(['😢', '😭', '💔', '😔', '🥺']);

/**
 * Un message qui ACQUIESCE, REMERCIE ou clôt un échange. Il n'appelle ni doute
 * ni peine : c'est le cas exact mesuré en production.
 *
 * L'apostrophe droite ET typographique sont acceptées — « D'accord » et
 * « D’accord » sont le même mot, et seul le second apparaissait en base.
 */
const ACQUIESCEMENT =
  /^\s*(d['’]acc(ord)?|ok(ay)?|oui|non|merci( beaucoup)?|bien s[uû]r|parfait|super|entendu|[cç]a marche|top|nickel|exact(ement)?|voil[àa]|compris|[àa] demain|bonne journ[ée]e|👍|✅)[\s!.…,]*$/i;

/** Marqueurs d'un propos POSITIF — un souhait, une félicitation, un compliment. */
const MARQUEURS_POSITIFS =
  /(excellent|excellente|bravo|f[ée]licitations|g[ée]nial|superbe|magnifique|bonne (journ[ée]e|soir[ée]e|chance)|bon (week-?end|courage)|au top|merci)/i;

/** Marqueurs d'un propos TRISTE — là, la peine a du sens. */
const MARQUEURS_TRISTES =
  /(d[ée]sol[ée]|triste|terrible|dommage|malheureusement|d[ée]c[èe]s|perdu|[ée]chec|douleur|condol[ée]ances|dur|difficile|peine)/i;

/** En deçà, un message n'offre pas matière à s'interroger. */
const MOTS_MIN_POUR_DOUTER = 5;

const compterMots = (texte: string): number => texte.trim().split(/\s+/).filter(Boolean).length;

/**
 * Cette réaction contredit-elle son message ?
 *
 * `contenuCible` absent ou vide ⇒ toujours cohérent : un média sans légende ne
 * se juge pas, et refuser faute d'information ferait taire l'agent sur tout ce
 * qui n'est pas du texte.
 */
export function reactionEstCoherente(emoji: string, contenuCible: string | undefined | null): VerdictReaction {
  const texte = (contenuCible ?? '').trim();
  if (texte.length === 0) return { ok: true };

  const acquiescement = ACQUIESCEMENT.test(texte);

  if (EMOJIS_DOUTE.has(emoji)) {
    if (acquiescement) {
      return { ok: false, reason: `doute (${emoji}) sur un acquiescement — « ${texte.slice(0, 40)} »` };
    }
    const estQuestion = texte.includes('?') || texte.includes('？');
    if (!estQuestion && compterMots(texte) < MOTS_MIN_POUR_DOUTER) {
      return { ok: false, reason: `doute (${emoji}) sur un message trop bref pour appeler une réserve` };
    }
    return { ok: true };
  }

  if (EMOJIS_TRISTESSE.has(emoji)) {
    // La peine est justifiée dès que le propos porte lui-même de la peine ;
    // ce test passe AVANT le refus, sans quoi « désolé, c'est dur » — bref et
    // triste — serait rejeté comme un acquiescement.
    if (MARQUEURS_TRISTES.test(texte)) return { ok: true };
    if (acquiescement || MARQUEURS_POSITIFS.test(texte)) {
      return { ok: false, reason: `tristesse (${emoji}) sur un propos positif — « ${texte.slice(0, 40)} »` };
    }
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Une seule réaction par (message, emoji), et un agent ne réagit qu'une fois
 * par message.
 *
 * Deux agents posant 🙌 sur le même message à la même minute ne se lisent pas
 * comme deux avis : ça se lit comme une machine. Le premier de la liste gagne —
 * l'ordre vient du strategist, qui a déjà classé ses intentions.
 */
export function dedupliquerReactions(reactions: readonly PendingReaction[]): PendingReaction[] {
  const vuMessageEmoji = new Set<string>();
  const vuAgentMessage = new Set<string>();

  return reactions.filter((r) => {
    const cleMessageEmoji = `${r.targetMessageId}::${r.emoji}`;
    const cleAgentMessage = `${r.asUserId}::${r.targetMessageId}`;
    if (vuMessageEmoji.has(cleMessageEmoji) || vuAgentMessage.has(cleAgentMessage)) return false;
    vuMessageEmoji.add(cleMessageEmoji);
    vuAgentMessage.add(cleAgentMessage);
    return true;
  });
}
