// Mock for MermaidDiagramImpl to avoid mermaid ESM issues
import React from 'react';

export interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, className }) => {
  return (
    <div className={className} data-testid="mermaid-diagram">
      <pre>{code}</pre>
    </div>
  );
};
