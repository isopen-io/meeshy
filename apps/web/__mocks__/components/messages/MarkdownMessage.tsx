// Mock for MarkdownMessage to avoid ESM issues with react-markdown
import React from 'react';

export interface MarkdownMessageProps {
  content: string;
  className?: string;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, className }) => {
  return (
    <div className={className} data-testid="markdown-message">
      <div>{content}</div>
    </div>
  );
};

export default MarkdownMessage;
