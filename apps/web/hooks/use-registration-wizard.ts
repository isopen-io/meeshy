'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuthFormStore } from '@/stores/auth-form-store';

export interface WizardFormData {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  systemLanguage: string;
  regionalLanguage: string;
}

export interface WizardStep {
  id: 'contact' | 'identity' | 'username' | 'security' | 'preferences';
  icon: any;
  color: string;
}

const FORM_STORAGE_KEY = 'meeshy_signup_wizard_temp_data';

export const WIZARD_STEPS: WizardStep[] = [
  { id: 'contact', icon: null, color: 'from-cyan-500 to-blue-600' },
  { id: 'identity', icon: null, color: 'from-violet-500 to-purple-600' },
  { id: 'username', icon: null, color: 'from-pink-500 to-rose-600' },
  { id: 'security', icon: null, color: 'from-amber-500 to-orange-600' },
  { id: 'preferences', icon: null, color: 'from-emerald-500 to-teal-600' },
];

interface UseRegistrationWizardOptions {
  linkId?: string;
  onStepChange?: (step: number) => void;
}

export function useRegistrationWizard(options: UseRegistrationWizardOptions = {}) {
  const { linkId, onStepChange } = options;
  const { identifier: sharedIdentifier } = useAuthFormStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [formData, setFormData] = useState<WizardFormData>({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    email: sharedIdentifier?.includes('@') ? sharedIdentifier : '',
    phoneNumber: sharedIdentifier && !sharedIdentifier.includes('@') && /^\+?\d/.test(sharedIdentifier) ? sharedIdentifier : '',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
  });

  // Skip username step if linkId is present
  const activeSteps = linkId ? WIZARD_STEPS.filter(s => s.id !== 'username') : WIZARD_STEPS;
  const totalSteps = activeSteps.length;

  // Restore form data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(FORM_STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setFormData(prev => ({
          ...prev,
          ...parsed,
          password: '', // Require re-entry for security
        }));
      } catch (e) {
        localStorage.removeItem(FORM_STORAGE_KEY);
      }
    }
  }, []);

  // Save form data to localStorage on change (excluding password)
  useEffect(() => {
    const { password, ...safeData } = formData;
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(safeData));
  }, [formData]);

  const updateFormData = useCallback((updates: Partial<WizardFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setDirection(1);
      setCurrentStep(prev => {
        const next = prev + 1;
        onStepChange?.(next);
        return next;
      });
    }
  }, [currentStep, totalSteps, onStepChange]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(prev => {
        const next = prev - 1;
        onStepChange?.(next);
        return next;
      });
    }
  }, [currentStep, onStepChange]);

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < totalSteps && step <= currentStep) {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
      onStepChange?.(step);
    }
  }, [currentStep, totalSteps, onStepChange]);

  const clearFormStorage = useCallback(() => {
    localStorage.removeItem(FORM_STORAGE_KEY);
  }, []);

  const currentStepData = activeSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return {
    // State
    currentStep,
    direction,
    formData,
    activeSteps,
    totalSteps,
    currentStepData,
    isFirstStep,
    isLastStep,

    // Actions
    updateFormData,
    nextStep,
    prevStep,
    goToStep,
    clearFormStorage,
  };
}
