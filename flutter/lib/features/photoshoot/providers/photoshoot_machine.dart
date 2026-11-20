/// Photoshoot step machine (Flutter).
///
/// Mirrors frontend/src/stores/photoshootMachine.ts. Keep the two tables
/// identical; the tests on both sides run the same edges.
///
/// Edges (from -> to):
///   upload     -> configure    continue (photos added)
///   configure  -> upload       back
///   configure  -> generating   start (not while a run is in flight)
///   generating -> generating   run again: retry, or stay with a failure shown
///                              (not while a run is in flight)
///   generating -> results      complete
///   generating -> configure    back to options (not while running) or
///                              cancel (allowed while running)
///   results    -> configure    new style
///   results    -> upload       start over
///
/// A failed start or a failed job stays on generating, with the error shown
/// there, so the user can retry or go back to options.
enum PhotoshootStep { upload, configure, generating, results }

bool canTransition(
  PhotoshootStep from,
  PhotoshootStep to, {
  required bool running,
  bool cancel = false,
}) {
  switch (from) {
    case PhotoshootStep.upload:
      return to == PhotoshootStep.configure;
    case PhotoshootStep.configure:
      if (to == PhotoshootStep.upload) return true;
      if (to == PhotoshootStep.generating) return !running;
      return false;
    case PhotoshootStep.generating:
      if (to == PhotoshootStep.results) return true;
      if (to == PhotoshootStep.generating) return !running;
      if (to == PhotoshootStep.configure) return !running || cancel;
      return false;
    case PhotoshootStep.results:
      return to == PhotoshootStep.configure || to == PhotoshootStep.upload;
  }
}

/// Returns [to] when the edge is legal, otherwise [from] (no change).
PhotoshootStep transition(
  PhotoshootStep from,
  PhotoshootStep to, {
  required bool running,
  bool cancel = false,
}) => canTransition(from, to, running: running, cancel: cancel) ? to : from;
