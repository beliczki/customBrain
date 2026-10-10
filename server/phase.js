// Progress events for a long request (0.64.0, moved here 0.67.0): what
// /trace?stream=1 sends as {type:'phase'} lines. A caller without a stream
// passes the no-op emit.

/** Time one promise as a stage: a 'start' line now, a 'done' line with ms + note when it settles. */
export function phase(emit, name, label, promise, note = () => null) {
  const done = stage(emit, name, label);
  return promise.then((value) => { done(note(value)); return value; });
}

/** Start a stage by hand; call the returned function with an optional note when it is done. */
export function stage(emit, name, label) {
  emit({ type: 'phase', name, label, status: 'start' });
  const t = Date.now();
  return (note = null) => emit({ type: 'phase', name, label, status: 'done', ms: Date.now() - t, note });
}
