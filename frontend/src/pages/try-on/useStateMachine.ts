import { useCallback, useRef, useState } from 'react';

/**
 * Runs a pure transition function behind React state.
 *
 * The ref updates synchronously, so a second event sent in the same tick sees
 * the first event's result. A reducer cannot give that: dispatch only queues.
 *
 * `send` returns false when the transition rejected the event (same object).
 */
export function useStateMachine<S, E>(
  initial: S | (() => S),
  transition: (state: S, event: E) => S
): [S, (event: E) => boolean, () => S] {
  const [state, setState] = useState<S>(initial);
  const ref = useRef<S>(state);

  const send = useCallback(
    (event: E): boolean => {
      const prev = ref.current;
      const next = transition(prev, event);
      if (next === prev) return false;
      ref.current = next;
      setState(next);
      return true;
    },
    [transition]
  );

  const getState = useCallback(() => ref.current, []);

  return [state, send, getState];
}
