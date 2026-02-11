'use client';

import { cn } from '@/lib/utils';

export interface ProgressStepsProps {
  steps: number;
  currentStep: number;
  className?: string;
}

function ProgressSteps({ steps, currentStep, className }: ProgressStepsProps) {
  return (
    <div className={cn('flex items-center justify-center gap-0', className)}>
      {Array.from({ length: steps }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum <= currentStep;

        return (
          <div key={i} className="flex items-center">
            {/* Dot */}
            <div
              className="w-3 h-3 rounded-full transition-colors duration-300"
              style={{
                background: isActive ? 'var(--gp-terracotta)' : 'var(--gp-border)',
              }}
            />
            {/* Bar between dots */}
            {i < steps - 1 && (
              <div
                className="w-12 h-1 rounded-full transition-colors duration-300"
                style={{
                  background: stepNum < currentStep ? 'var(--gp-terracotta)' : 'var(--gp-border)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

ProgressSteps.displayName = 'ProgressSteps';

export { ProgressSteps };
