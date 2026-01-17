'use client';

import { useState, useCallback } from 'react';
import { AuthMode } from '@/types';

export interface AnonymousFormData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  birthday: string;
  language: string;
}

export function useJoinFlow() {
  const [authMode, setAuthMode] = useState<AuthMode>('welcome');
  const [showAnonymousForm, setShowAnonymousForm] = useState(false);
  const [anonymousForm, setAnonymousForm] = useState<AnonymousFormData>({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    birthday: '',
    language: 'fr'
  });

  const generateUsername = useCallback((firstName: string, lastName: string) => {
    const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanLastName = lastName.toLowerCase().replace(/[^a-z]/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${cleanFirstName}_${cleanLastName}${randomSuffix}`;
  }, []);

  const updateAnonymousForm = useCallback((field: keyof AnonymousFormData, value: string) => {
    setAnonymousForm(prev => {
      const newForm = { ...prev, [field]: value };

      if (field === 'firstName' || field === 'lastName') {
        if (newForm.firstName && newForm.lastName && !prev.username) {
          newForm.username = generateUsername(newForm.firstName, newForm.lastName);
        }
      }

      return newForm;
    });
  }, [generateUsername]);

  const resetAnonymousForm = useCallback(() => {
    setAnonymousForm({
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      birthday: '',
      language: 'fr'
    });
  }, []);

  return {
    authMode,
    setAuthMode,
    showAnonymousForm,
    setShowAnonymousForm,
    anonymousForm,
    updateAnonymousForm,
    resetAnonymousForm,
    generateUsername
  };
}
