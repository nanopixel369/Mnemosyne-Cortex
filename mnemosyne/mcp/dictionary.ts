/**
 * mnemosyne/mcp/dictionary.ts
 * Single source of truth for Meridian Glyph types.
 * Parsed once at startup — no file reads during tool calls.
 */

export interface DomainType {
  emoji:       string;
  typeId:      string;
  description: string;
  weight:      number;
  category:    "domain" | "landmark";
}

export const DOMAIN_TYPES: Record<string, DomainType> = {
  INSIGHT:    { emoji: "💡", typeId: "INSIGHT",    description: "Key insight, realization, or conceptual breakthrough",  weight: 3, category: "domain" },
  IMPL:       { emoji: "🔧", typeId: "IMPL",       description: "Implementation code, working solution",                  weight: 3, category: "domain" },
  BUG:        { emoji: "🐛", typeId: "BUG",        description: "Bug, error, or broken behavior",                        weight: 2, category: "domain" },
  FIX:        { emoji: "✅", typeId: "FIX",        description: "Resolution, fix, or correction to a prior bug",         weight: 2, category: "domain" },
  RISK:       { emoji: "⚠️", typeId: "RISK",       description: "Risk, caveat, or known limitation",                     weight: 2, category: "domain" },
  EXPERIMENT: { emoji: "🧪", typeId: "EXPERIMENT", description: "Experimental idea, hypothesis, or test",                weight: 2, category: "domain" },
  DESIGN:     { emoji: "📐", typeId: "DESIGN",     description: "Architecture, system design, or structural decision",   weight: 3, category: "domain" },
  PLAN:       { emoji: "📋", typeId: "PLAN",       description: "Plan, roadmap, or sequence of steps",                   weight: 1, category: "domain" },
  CONVO:      { emoji: "🗣️", typeId: "CONVO",      description: "Raw conversation exchange worth preserving",            weight: 1, category: "domain" },
  ANCHOR:     { emoji: "📌", typeId: "ANCHOR",     description: "Key reference point, important named thing",            weight: 3, category: "domain" },
  DATA:       { emoji: "🔢", typeId: "DATA",       description: "Numerical data, measurements, metrics, benchmarks",     weight: 2, category: "domain" },
  PREF:       { emoji: "👤", typeId: "PREF",       description: "User preference, personal fact, or stated opinion",     weight: 2, category: "domain" },
  REF:        { emoji: "🔗", typeId: "REF",        description: "External reference, citation, or source",               weight: 1, category: "domain" },
  ERROR:      { emoji: "❌", typeId: "ERROR",      description: "Mistake made and acknowledged during session",          weight: 1, category: "domain" },
  CONCEPT:    { emoji: "🧠", typeId: "CONCEPT",    description: "Abstract concept being defined or explored",            weight: 3, category: "domain" },
  ARTIFACT:   { emoji: "📦", typeId: "ARTIFACT",   description: "Named output — file, document, or deliverable produced",weight: 2, category: "domain" },
  CONTEXT:    { emoji: "🌐", typeId: "CONTEXT",    description: "Background context needed to understand the session",   weight: 1, category: "domain" },
  DECISION:   { emoji: "⚡", typeId: "DECISION",   description: "Explicit decision made, with reasoning",                weight: 3, category: "domain" },
};

export const LANDMARK_TYPES: Record<string, DomainType> = {
  LM_LOCATION:   { emoji: "📍", typeId: "LM_LOCATION",   description: "Specific location in reasoning or narrative",          weight: 2, category: "landmark" },
  LM_CONCLUSION: { emoji: "🏁", typeId: "LM_CONCLUSION", description: "Conclusion or summary point",                          weight: 3, category: "landmark" },
  LM_KEY:        { emoji: "🔑", typeId: "LM_KEY",        description: "Single most important statement in a region",          weight: 3, category: "landmark" },
  LM_QUESTION:   { emoji: "❓", typeId: "LM_QUESTION",   description: "Open question left unresolved",                        weight: 2, category: "landmark" },
  LM_QUOTE:      { emoji: "💬", typeId: "LM_QUOTE",      description: "Direct quote or verbatim statement worth preserving",  weight: 2, category: "landmark" },
  LM_REVISION:   { emoji: "🔄", typeId: "LM_REVISION",   description: "Point where something was revised or reconsidered",    weight: 2, category: "landmark" },
};

// Reverse lookup: emoji -> type entry
export const EMOJI_TO_TYPE: Record<string, DomainType> = {};
for (const entry of Object.values(DOMAIN_TYPES))   EMOJI_TO_TYPE[entry.emoji] = entry;
for (const entry of Object.values(LANDMARK_TYPES)) EMOJI_TO_TYPE[entry.emoji] = entry;

// Gradient scale for minimap computation
export const GRADIENT_SCALE: Array<[number, string]> = [
  [0,   "·"],
  [2,   "░"],
  [5,   "▒"],
  [9,   "▓"],
  [14,  "█"],
  [999, "◉"],
];

export const MINIMAP_SIZE = 100;
export const CHUNK_SIZE   = 4096; // bytes per chunk

export function resolveType(query: string): DomainType | null {
  // Try typeId first (e.g. "INSIGHT"), then emoji (e.g. "💡")
  return DOMAIN_TYPES[query.trim().toUpperCase()]
      ?? LANDMARK_TYPES[query.trim().toUpperCase()]
      ?? EMOJI_TO_TYPE[query.trim()]
      ?? null;
}

export function heatSymbol(score: number): string {
  for (let i = GRADIENT_SCALE.length - 1; i >= 0; i--) {
    if (score > GRADIENT_SCALE[i][0]) return GRADIENT_SCALE[i][1];
  }
  return "·";
}
