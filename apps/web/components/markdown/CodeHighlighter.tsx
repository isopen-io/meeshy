'use client';

import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface CodeHighlighterProps {
  children: string;
  language: string;
  isDark: boolean;
}

export function CodeHighlighter({ children, language, isDark }: CodeHighlighterProps) {
  return (
    <SyntaxHighlighter
      style={isDark ? vscDarkPlus : vs}
      language={language}
      PreTag="div"
      className="rounded-md my-2 text-xs"
      showLineNumbers={true}
    >
      {children}
    </SyntaxHighlighter>
  );
}
