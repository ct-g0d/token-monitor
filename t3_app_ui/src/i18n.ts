// @ts-ignore
import * as i18nNamespace from '../../src/electron/renderer/i18n.js';

const i18nModule: any = (i18nNamespace as Record<string, any>)['default'] || i18nNamespace;

export const i18n =
  typeof window !== 'undefined' && (window as any).TokenMonitorI18n
    ? (window as any).TokenMonitorI18n
    : i18nModule;

if (typeof window !== 'undefined' && !(window as any).TokenMonitorI18n) {
  (window as any).TokenMonitorI18n = i18n;
}

export function resolveLocale(language?: string, preferred?: readonly string[] | string[]): string {
  const pref = preferred || (typeof navigator !== 'undefined' && navigator.languages?.length ? navigator.languages : [navigator?.language || 'en']);
  return i18n?.resolveLocale ? i18n.resolveLocale(language || 'auto', pref) : (language && language !== 'auto' ? language : 'en');
}

export function translate(locale: string, key: string, params?: Record<string, any>): string {
  return i18n?.translate ? i18n.translate(locale, key, params) : key;
}

export function t(key: string, params?: Record<string, any>, customLocale?: string): string {
  const currentLocale =
    customLocale ||
    (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-locale') || document.documentElement.lang : 'en') ||
    'en';
  return translate(currentLocale, key, params);
}

export default i18n;
