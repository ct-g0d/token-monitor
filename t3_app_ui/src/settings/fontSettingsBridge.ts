// Bridge to Token Monitor's shared font settings contract
import '../../../src/shared/fontSettings.js';

export interface FontSettingsApi {
  DEFAULT_DASHBOARD_INTERFACE_FONT: string;
  DEFAULT_DISPLAY_FONT: string;
  DEFAULT_INTERFACE_FONT: string;
  FONT_PRESETS: {
    app: string;
    system: string;
    mono: string;
  };
  MAX_FONT_FAMILY_LENGTH: number;
  SYSTEM_UI_FONT: string;
  normalizeTextSize(value: any): string;
  textScaleForSize(value: any): number;
  fontFamilyForPreset(preset: string, customValue?: string, role?: string): string;
  normalizeFontFamily(value: any): string;
  presetForFontFamily(value: any, role?: string): string;
  resolveEffectiveFontSettings(settings?: any, options?: { interfaceDefault?: string }): {
    interfaceFont: string;
    displayFont: string;
  };
  applyFontSettings(doc?: any, settings?: any, options?: any): {
    interfaceFont: string;
    displayFont: string;
    textSize: string;
    textScale: number;
  } | null;
}

export const fontSettingsApi: FontSettingsApi =
  (typeof window !== 'undefined' && (window as any).TokenMonitorFontSettings) ||
  (typeof window !== 'undefined' && (window as any).TokenMonitorBridge?.TokenMonitorFontSettings) ||
  (typeof globalThis !== 'undefined' && (globalThis as any).TokenMonitorFontSettings);
