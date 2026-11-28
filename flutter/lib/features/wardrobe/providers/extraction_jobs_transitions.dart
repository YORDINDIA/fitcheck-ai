/// Lifecycle of a tracked job. `running` covers uploading, extracting and
/// generating. The banner and jobs list show counts, not phases.
enum TrackedJobStatus { running, complete, failed, cancelled }

/// Allowed status changes. `running` may end in any terminal state. The
/// terminal states map to empty sets: nothing moves a finished job.
const Map<TrackedJobStatus, Set<TrackedJobStatus>> trackedJobTransitions = {
  TrackedJobStatus.running: {
    TrackedJobStatus.complete,
    TrackedJobStatus.failed,
    TrackedJobStatus.cancelled,
  },
  TrackedJobStatus.complete: <TrackedJobStatus>{},
  TrackedJobStatus.failed: <TrackedJobStatus>{},
  TrackedJobStatus.cancelled: <TrackedJobStatus>{},
};

/// True when a job may move from [from] to [to]. Staying in the same status
/// is not a transition. Counter updates that keep the status do not call
/// this; they check the job is still running.
bool canTransition(TrackedJobStatus from, TrackedJobStatus to) =>
    from != to && (trackedJobTransitions[from]?.contains(to) ?? false);

/// The status with this name, or null when the name is unknown or missing.
/// The caller decides what an unknown saved status means.
TrackedJobStatus? trackedJobStatusFromName(String? name) {
  for (final status in TrackedJobStatus.values) {
    if (status.name == name) return status;
  }
  return null;
}
