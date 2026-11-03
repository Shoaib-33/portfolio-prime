'use client';
/* The visitor's language for client components: the root layout provides it, useT() translates. */
import { createContext, useContext, ReactNode } from 'react';
import { tr } from '@/lib/i18n';

const LangContext = createContext<'nl' | 'en'>('en');
export function LangProvider({ lang, children }: { lang: 'nl' | 'en'; children: ReactNode }) { return <LangContext.Provider value={lang}>{children}</LangContext.Provider>; }
export const useLang = () => useContext(LangContext);
export const useT = () => tr(useContext(LangContext));
