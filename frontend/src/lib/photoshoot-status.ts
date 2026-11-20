/**
 * True when a photoshoot job or result has finished. The backend has used
 * "complete" and "completed" for this state, so both values count.
 */
export function isPhotoshootComplete(status: string): boolean {
  return status === 'complete' || status === 'completed';
}
