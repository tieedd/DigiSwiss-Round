/**
 * Konfigurasi Utama DigiSwiss TCG
 */
export const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbxtoMVz8zGLd_PK4C9bVPRy4ZQc3lWtrdT3YT8PX0RTyACkP4P8gpbxLeD_0FVOSeAEDg/exec";

export const getActiveApiUrl = (): string => {
  if (typeof window !== "undefined" && window.localStorage) {
    const saved = window.localStorage.getItem("DIGISWISS_API_URL");
    if (saved && saved.trim() !== "") {
      return saved.trim();
    }
  }
  return DEFAULT_API_URL;
};

export const API_URL = getActiveApiUrl();

export const APP_CONFIG = {
  appName: "DigiSwiss",
  tagline: "Digimon TCG Swiss Round Tournament Manager",
  version: "5.0.0",
  timeoutMs: 20000,
  defaultRounds: 3,
  gameTimeLimitMinutes: 45
};
