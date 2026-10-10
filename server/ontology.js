// The ontology's layers (docs/ontologia-es-helyzetcsomag-spec-2026-10-10.md,
// section 2) — ONE definition of which layer an item belongs to, shared by
// map (HÁTTÉR = Tudás) and the Graph's Ontológia mode. Two hand-kept
// lists would drift apart; this is the place to change the rule.

export const LAYERS = [
  { key: 'horgony', label: 'Horgony' },
  { key: 'tortenes', label: 'Történés' },
  { key: 'targy', label: 'Tárgy' },
  { key: 'vallalas', label: 'Vállalás' },
  { key: 'tudas', label: 'Tudás' },
];

// Knowledge = external (YouTube, references) or digested internal (syntheses,
// decisions). A `task` thought stays Történés: the Vállalás layer is the
// verified commitments, a thought is only a candidate (D1–D5).
const KNOWLEDGE_TYPES = new Set(['reference', 'synthesis', 'decision']);

/** Layer of a stored point: a thought, or a dossier (kind: 'dossier'). */
export function layerOf(p) {
  if (p.kind === 'dossier') return p.dossier_type === 'repo' ? 'targy' : 'horgony';
  if (p.source === 'youtube' || KNOWLEDGE_TYPES.has(p.type)) return 'tudas';
  return 'tortenes';
}
