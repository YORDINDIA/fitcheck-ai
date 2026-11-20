import 'package:fitcheck_ai/features/photoshoot/providers/photoshoot_machine.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const steps = PhotoshootStep.values;

  // Legal edges when the run is idle (running: false, cancel: false).
  const legalIdle = <(PhotoshootStep, PhotoshootStep)>{
    (PhotoshootStep.upload, PhotoshootStep.configure),
    (PhotoshootStep.configure, PhotoshootStep.upload),
    (PhotoshootStep.configure, PhotoshootStep.generating),
    (PhotoshootStep.generating, PhotoshootStep.results),
    (PhotoshootStep.generating, PhotoshootStep.generating),
    (PhotoshootStep.generating, PhotoshootStep.configure),
    (PhotoshootStep.results, PhotoshootStep.configure),
    (PhotoshootStep.results, PhotoshootStep.upload),
  };

  group('idle edges', () {
    for (final from in steps) {
      for (final to in steps) {
        final legal = legalIdle.contains((from, to));
        test('$from -> $to is ${legal ? "legal" : "rejected"}', () {
          expect(canTransition(from, to, running: false), legal);
          expect(transition(from, to, running: false), legal ? to : from);
        });
      }
    }
  });

  test('exactly 8 idle edges are legal', () {
    expect(legalIdle.length, 8);
  });

  group('run in flight', () {
    test('a second start while running is rejected', () {
      expect(
        canTransition(
          PhotoshootStep.generating,
          PhotoshootStep.generating,
          running: true,
        ),
        isFalse,
      );
    });

    test('back-step to configure while running is rejected', () {
      expect(
        canTransition(
          PhotoshootStep.generating,
          PhotoshootStep.configure,
          running: true,
        ),
        isFalse,
      );
    });

    test('back-step to upload while generating is rejected', () {
      expect(
        canTransition(
          PhotoshootStep.generating,
          PhotoshootStep.upload,
          running: true,
        ),
        isFalse,
      );
      expect(
        canTransition(
          PhotoshootStep.generating,
          PhotoshootStep.upload,
          running: false,
        ),
        isFalse,
      );
    });

    test('cancel (generating -> configure) is allowed while running', () {
      expect(
        canTransition(
          PhotoshootStep.generating,
          PhotoshootStep.configure,
          running: true,
          cancel: true,
        ),
        isTrue,
      );
    });

    test('completion (generating -> results) is allowed while running', () {
      expect(
        canTransition(
          PhotoshootStep.generating,
          PhotoshootStep.results,
          running: true,
        ),
        isTrue,
      );
    });
  });
}
