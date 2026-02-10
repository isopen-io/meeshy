'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardStep } from '@/hooks/use-registration-wizard';

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function WizardProgress({ steps, currentStep, onStepClick }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={step.id} className="flex items-center">
            <motion.button
              type="button"
              onClick={() => {
                if (index < currentStep) {
                  onStepClick(index);
                }
              }}
              disabled={index > currentStep}
              className={cn(
                "relative w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                isActive && `bg-gradient-to-br ${step.color} text-white shadow-md`,
                isCompleted && "bg-green-500 text-white cursor-pointer",
                !isActive && !isCompleted && "bg-gray-100 dark:bg-gray-800 text-muted-foreground cursor-not-allowed"
              )}
              whileHover={index <= currentStep ? { scale: 1.1 } : {}}
              whileTap={index <= currentStep ? { scale: 0.95 } : {}}
            >
              {isCompleted ? <Check className="w-4 h-4" /> : Icon && <Icon className="w-4 h-4" />}
            </motion.button>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-4 h-0.5 mx-0.5 rounded-full transition-colors",
                index < currentStep ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
