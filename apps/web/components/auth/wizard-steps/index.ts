// Lazy-loaded step components for optimal bundle size
import dynamic from 'next/dynamic';

export const ContactStep = dynamic(() => import('./ContactStep').then(m => ({ default: m.ContactStep })));

export const IdentityStep = dynamic(() => import('./IdentityStep').then(m => ({ default: m.IdentityStep })));

export const UsernameStep = dynamic(() => import('./UsernameStep').then(m => ({ default: m.UsernameStep })));

export const SecurityStep = dynamic(() => import('./SecurityStep').then(m => ({ default: m.SecurityStep })));

export const PreferencesStep = dynamic(() => import('./PreferencesStep').then(m => ({ default: m.PreferencesStep })));
