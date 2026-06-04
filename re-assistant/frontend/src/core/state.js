'use strict';
/**
 * core/state.js
 * Zentraler Anwendungs-State — wird von allen Modulen geteilt.
 */
const S = {
  // Auth
  user: null,

  // Settings (werden aus localStorage/API geladen)
  settings: {
    apiKey: '', model: 'claude-sonnet-4-20250514',
    language: 'de', detail: 'standard',
    voiceURI: '', persona: 'professional',
    jiraUrl: '', jiraEmail: '', jiraToken: '',
    adoUrl: '', adoProject: '', adoToken: '',
  },

  // Daten-Cache
  systems:      [],
  users:        [],
  requirements: [],
  backlogs:     [],
  workshops:    [],
  diagrams:     [],

  // Navigation
  activeView:        null,
  activeSystemId:    null,
  pmActiveSystemId:  null,

  // Chat-Historien pro Context
  chatHistory: { bc: [], pmc: [], voice: [], ws: [] },

  // Voice Bot
  ttsSpeed:      1.0,
  voiceOrbState: 'idle',
  voiceRec:      null,
  chatMicRec:    null,

  // Feature-State
  activeWorkshopId:  null,
  activeDiagramId:   null,
  dedupSuggestion:   null,
  currentBacklog:    null,
  jiraProjects:      [],
};

window.S = S;
