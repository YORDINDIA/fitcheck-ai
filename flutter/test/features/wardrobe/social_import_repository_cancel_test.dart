import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:fitcheck_ai/core/network/api_client.dart';
import 'package:fitcheck_ai/features/wardrobe/repositories/social_import_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// Answers every request with one fixed status code and an empty JSON body.
class _StatusAdapter implements HttpClientAdapter {
  _StatusAdapter(this.statusCode);

  final int statusCode;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return ResponseBody.fromString(
      '{}',
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUp(() {
    // Drop auth and refresh interceptors so the test never reads stored tokens.
    ApiClient.instance.dio.interceptors.clear();
  });

  group('SocialImportRepository.cancelJob', () {
    test('completes when the backend answers 409 (job already finished)', () async {
      ApiClient.instance.dio.httpClientAdapter = _StatusAdapter(409);

      await expectLater(
        SocialImportRepository().cancelJob('job-1'),
        completes,
      );
    });

    test('still throws on a server error', () async {
      ApiClient.instance.dio.httpClientAdapter = _StatusAdapter(500);

      await expectLater(
        SocialImportRepository().cancelJob('job-1'),
        throwsA(anything),
      );
    });
  });
}
