import 'dart:async';
import 'dart:convert';

import 'package:fitcheck_ai/features/wardrobe/models/batch_extraction_models.dart';
import 'package:fitcheck_ai/features/wardrobe/providers/batch_extraction_provider.dart'
    show batchExtractionRepositoryProvider;
import 'package:fitcheck_ai/features/wardrobe/providers/extraction_jobs_provider.dart';
import 'package:fitcheck_ai/features/wardrobe/repositories/batch_extraction_repository.dart';
import 'package:fitcheck_ai/core/services/persistence_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _registryKey = 'fitcheck.extraction_jobs.registry';

class _MemoryPersistence extends PersistenceService {
  final Map<String, String> _store = {};

  @override
  Future<bool> setString(String key, String value) async {
    _store[key] = value;
    return true;
  }

  @override
  Future<String?> getString(String key) async => _store[key];
}

class _FakeRepo extends BatchExtractionRepository {
  final List<StreamController<SSEEvent>> streams = [];

  /// When set, the next status request returns this future (then clears).
  Future<BatchJobStatusResponse>? nextStatus;

  /// When set, every server cancel waits on it.
  Future<void>? cancelGate;
  int cancelCalls = 0;

  @override
  Stream<SSEEvent> subscribeToEvents(String jobId) {
    final controller = StreamController<SSEEvent>();
    streams.add(controller);
    return controller.stream;
  }

  @override
  Future<BatchJobStatusResponse> getJobStatus(String jobId) {
    final pending = nextStatus;
    if (pending != null) {
      nextStatus = null;
      return pending;
    }
    return Future.value(
      BatchJobStatusResponse(
        jobId: jobId,
        status: 'extracting',
        totalImages: 1,
      ),
    );
  }

  @override
  Future<void> cancelJob(String jobId) async {
    cancelCalls++;
    final gate = cancelGate;
    if (gate != null) await gate;
  }
}

TrackedJob _job({String id = 'j1', TrackedJobStatus? status}) => TrackedJob(
  jobId: id,
  kind: TrackedJobKind.batch,
  label: '1 photo',
  sourcePaths: const [],
  // Recent on purpose: restore prunes terminal jobs older than 7 days.
  createdAt: DateTime.now(),
  status: status ?? TrackedJobStatus.running,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  ({
    ProviderContainer container,
    ExtractionJobsNotifier jobs,
    _FakeRepo repo,
    _MemoryPersistence persistence,
  })
  host({_MemoryPersistence? persistence}) {
    final repo = _FakeRepo();
    final store = persistence ?? _MemoryPersistence();
    final container = ProviderContainer(
      overrides: [
        batchExtractionRepositoryProvider.overrideWithValue(repo),
        extractionJobsPersistenceProvider.overrideWithValue(store),
        extractionJobsDocsDirProvider.overrideWithValue(
          () async => throw StateError('no documents directory in unit tests'),
        ),
      ],
    );
    addTearDown(container.dispose);
    container.listen(extractionJobsProvider, (_, _) {});
    return (
      container: container,
      jobs: container.read(extractionJobsProvider.notifier),
      repo: repo,
      persistence: store,
    );
  }

  Future<void> until(bool Function() cond) async {
    for (var i = 0; i < 200 && !cond(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
  }

  group('transition table', () {
    test('running may move to complete, failed or cancelled', () {
      expect(
        canTransition(TrackedJobStatus.running, TrackedJobStatus.complete),
        isTrue,
      );
      expect(
        canTransition(TrackedJobStatus.running, TrackedJobStatus.failed),
        isTrue,
      );
      expect(
        canTransition(TrackedJobStatus.running, TrackedJobStatus.cancelled),
        isTrue,
      );
    });

    test('terminal states are final: no move to any status', () {
      for (final from in [
        TrackedJobStatus.complete,
        TrackedJobStatus.failed,
        TrackedJobStatus.cancelled,
      ]) {
        for (final to in TrackedJobStatus.values) {
          expect(
            canTransition(from, to),
            isFalse,
            reason: '${from.name} -> ${to.name}',
          );
        }
      }
    });

    test('a status never moves to itself', () {
      for (final status in TrackedJobStatus.values) {
        expect(canTransition(status, status), isFalse);
      }
    });
  });

  group('status names', () {
    test('every status name parses back to its status', () {
      for (final status in TrackedJobStatus.values) {
        expect(trackedJobStatusFromName(status.name), status);
      }
    });

    test('an unknown or missing name parses to null', () {
      expect(trackedJobStatusFromName('paused'), isNull);
      expect(trackedJobStatusFromName(''), isNull);
      expect(trackedJobStatusFromName(null), isNull);
    });
  });

  group('saved status round trip', () {
    for (final status in TrackedJobStatus.values) {
      test('"${status.name}" survives toJson then fromJson', () {
        final restored = TrackedJob.fromJson(_job(status: status).toJson());

        expect(restored.status, status);
      });
    }
  });

  group('unknown saved status', () {
    test('an unknown status restores as failed, never running', () {
      final json = _job().toJson()..['status'] = 'paused';

      final restored = TrackedJob.fromJson(json);

      expect(restored.status, TrackedJobStatus.failed);
      expect(restored.isActive, isFalse);
      expect(
        restored.error,
        'Could not restore this scan. Remove it from your list.',
      );
    });

    test('a missing status restores as failed, never running', () {
      final json = _job().toJson()..remove('status');

      expect(TrackedJob.fromJson(json).status, TrackedJobStatus.failed);
    });

    test(
      'an unknown status on disk never subscribes or stays active',
      () async {
        final persistence = _MemoryPersistence();
        final json = _job().toJson()..['status'] = 'corrupt';
        await persistence.setString(_registryKey, jsonEncode([json]));

        final h = host(persistence: persistence);
        await until(
          () => h.container.read(extractionJobsProvider).job('j1') != null,
        );

        final job = h.container.read(extractionJobsProvider).job('j1')!;
        expect(job.status, TrackedJobStatus.failed);
        expect(h.container.read(extractionJobsProvider).active, isEmpty);
        expect(h.repo.streams, isEmpty);
      },
    );
  });

  group('terminal jobs never revert', () {
    test(
      'a running snapshot that lands after completion keeps complete',
      () async {
        final h = host();
        await h.jobs.trackBatch(
          jobId: 'j1',
          label: '1 photo',
          sourcePaths: const [],
        );
        h.jobs.attach('j1'); // page open: no shade notification in this test
        final gate = Completer<BatchJobStatusResponse>();
        h.repo.nextStatus = gate.future;

        // refreshStatus reads the job while running, then waits on the server.
        final pending = h.jobs.refreshStatus('j1');
        h.repo.streams.last.add(
          const SSEEvent(type: 'job_complete', data: {'items': []}),
        );
        await until(
          () =>
              h.container.read(extractionJobsProvider).job('j1')!.status ==
              TrackedJobStatus.complete,
        );

        gate.complete(
          BatchJobStatusResponse(
            jobId: 'j1',
            status: 'extracting',
            totalImages: 1,
          ),
        );
        expect(await pending, isTrue);

        expect(
          h.container.read(extractionJobsProvider).job('j1')!.status,
          TrackedJobStatus.complete,
        );
      },
    );

    test('a plain running snapshot after completion keeps complete', () async {
      final h = host();
      await h.jobs.trackBatch(
        jobId: 'j1',
        label: '1 photo',
        sourcePaths: const [],
      );
      h.jobs.attach('j1');
      h.repo.streams.last.add(
        const SSEEvent(type: 'job_complete', data: {'items': []}),
      );
      await until(
        () =>
            h.container.read(extractionJobsProvider).job('j1')!.status ==
            TrackedJobStatus.complete,
      );

      expect(await h.jobs.refreshStatus('j1'), isTrue);
      expect(
        h.container.read(extractionJobsProvider).job('j1')!.status,
        TrackedJobStatus.complete,
      );
      expect(h.container.read(extractionJobsProvider).active, isEmpty);
    });
  });

  group('cancel', () {
    test(
      'cancel from running calls the server once and ends cancelled',
      () async {
        final h = host();
        await h.jobs.trackBatch(
          jobId: 'j1',
          label: '1 photo',
          sourcePaths: const [],
        );

        await h.jobs.cancel('j1');

        expect(h.repo.cancelCalls, 1);
        expect(
          h.container.read(extractionJobsProvider).job('j1')!.status,
          TrackedJobStatus.cancelled,
        );
      },
    );

    test(
      'cancel after complete is a no-op: no server call, stays complete',
      () async {
        final h = host();
        await h.jobs.trackBatch(
          jobId: 'j1',
          label: '1 photo',
          sourcePaths: const [],
        );
        h.jobs.attach('j1');
        h.repo.streams.last.add(
          const SSEEvent(type: 'job_complete', data: {'items': []}),
        );
        await until(
          () =>
              h.container.read(extractionJobsProvider).job('j1')!.status ==
              TrackedJobStatus.complete,
        );

        await h.jobs.cancel('j1');

        expect(h.repo.cancelCalls, 0);
        expect(
          h.container.read(extractionJobsProvider).job('j1')!.status,
          TrackedJobStatus.complete,
        );
      },
    );

    test(
      'a completion that lands during a slow cancel is not overwritten',
      () async {
        final h = host();
        await h.jobs.trackBatch(
          jobId: 'j1',
          label: '1 photo',
          sourcePaths: const [],
        );
        h.jobs.attach('j1');
        final gate = Completer<void>();
        h.repo.cancelGate = gate.future;

        final pending = h.jobs.cancel('j1');
        await until(() => h.repo.cancelCalls == 1);
        h.repo.nextStatus = Future.value(
          BatchJobStatusResponse(
            jobId: 'j1',
            status: 'completed',
            totalImages: 1,
          ),
        );
        await h.jobs.refreshStatus('j1');
        gate.complete();
        await pending;

        expect(
          h.container.read(extractionJobsProvider).job('j1')!.status,
          TrackedJobStatus.complete,
        );
      },
    );
  });
}
