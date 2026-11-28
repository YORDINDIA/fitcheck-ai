import 'package:fitcheck_ai/features/photoshoot/models/photoshoot_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PhotoshootResult status', () {
    test('reads complete as the finished state', () {
      final result = PhotoshootResult.fromJson({
        'session_id': 'ps_1',
        'status': 'complete',
      });

      expect(result.status, PhotoshootStatus.complete);
    });

    test('reads completed as the finished state', () {
      final result = PhotoshootResult.fromJson({
        'session_id': 'ps_1',
        'status': 'completed',
      });

      expect(result.status, PhotoshootStatus.completed);
    });
  });
}
