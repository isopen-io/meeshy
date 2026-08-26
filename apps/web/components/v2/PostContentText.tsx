'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import type { PostReference } from '@meeshy/shared/types/post-reference';

/**
 * Rendu riche d'une caption de post/reel : mentions, hashtags, URLs colorés
 * et cliquables. Délibérément plus léger qu'un rendu markdown complet
 * (`MarkdownMessage.tsx`, réservé aux messages de conversation) — pas de
 * gras/italique/listes, juste ce que porte une caption de post.
 *
 * Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §5
 */

type Segment =
  | { type: 'text'; content: string }
  | { type: 'mention'; content: string; username: string }
  | { type: 'hashtag'; content: string; tag: string }
  | { type: 'url'; content: string };

// Même classe de caractères que le service gateway (HashtagService.ts) et
// MessageTextRenderer.swift — SSOT dupliquée consciemment (3 plateformes).
const MENTION_REGEX = /(?<![\p{L}\p{N}_])@([\p{L}\p{N}_-]{1,30})/gu;
const HASHTAG_REGEX = /(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_]{1,50})/gu;
const URL_REGEX = /(?<![@\w])https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/g;

function parseSegments(content: string): Segment[] {
  type RawMatch = { start: number; end: number; segment: Segment };
  const matches: RawMatch[] = [];

  for (const m of content.matchAll(MENTION_REGEX)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, segment: { type: 'mention', content: m[0], username: m[1] } });
  }
  for (const m of content.matchAll(HASHTAG_REGEX)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, segment: { type: 'hashtag', content: m[0], tag: m[1].toLowerCase() } });
  }
  for (const m of content.matchAll(URL_REGEX)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, segment: { type: 'url', content: m[0] } });
  }

  // Trie par position ; en cas de chevauchement (les 3 classes de caractères
  // sont disjointes, mais un hashtag PEUT suivre une URL dans le même texte),
  // le premier par position d'ouverture gagne.
  matches.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // chevauchement — déjà couvert
    if (m.start > cursor) {
      segments.push({ type: 'text', content: content.slice(cursor, m.start) });
    }
    segments.push(m.segment);
    cursor = m.end;
  }
  if (cursor < content.length) {
    segments.push({ type: 'text', content: content.slice(cursor) });
  }
  return segments;
}

export function PostContentText({
  content,
  references,
  className,
}: {
  content: string;
  /**
   * Les références que le serveur a validées. Fourni, SEULS ces pseudos
   * deviennent des liens.
   *
   * `undefined` (serveur non déployé) linkifie tout, comme avant : ne plus rien
   * linkifier serait une régression visible. `[]` ne linkifie rien — le serveur
   * s'est prononcé, et il dit qu'il n'y en a aucune.
   */
  references?: readonly PostReference[];
  className?: string;
}) {
  const validUsernames = references
    ? new Set(references.map((r) => r.username.toLowerCase()))
    : null;
  const segments = parseSegments(content);
  return (
    <p data-testid="post-content-text" className={`whitespace-pre-wrap ${className ?? ''}`}>
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'mention': {
            const canonical = segment.username.toLowerCase();
            if (validUsernames && !validUsernames.has(canonical)) {
              return <Fragment key={i}>{segment.content}</Fragment>;
            }
            return (
              <Link key={i} href={`/u/${canonical}`} className="text-[var(--gp-terracotta)] font-semibold hover:underline">
                {segment.content}
              </Link>
            );
          }
          case 'hashtag':
            return (
              <Link key={i} href={`/hashtag/${segment.tag}`} className="text-[var(--gp-terracotta)] font-semibold hover:underline">
                {segment.content}
              </Link>
            );
          case 'url':
            return (
              <a key={i} href={segment.content} target="_blank" rel="noopener noreferrer" className="text-[var(--gp-terracotta)] underline">
                {segment.content}
              </a>
            );
          default:
            return <Fragment key={i}>{segment.content}</Fragment>;
        }
      })}
    </p>
  );
}
