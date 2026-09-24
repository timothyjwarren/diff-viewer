/**
 * Shiki options shared by every highlighted view. Each token carries both
 * themes' colours as CSS variables (--shiki-light / --shiki-dark) and App.css
 * picks one to match the system colour scheme.
 */
export const SHIKI_THEMES = {
  themes: { light: "github-light", dark: "github-dark" },
  defaultColor: false,
} as const;
