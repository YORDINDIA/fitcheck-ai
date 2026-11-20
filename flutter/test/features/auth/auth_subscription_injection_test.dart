// Auth must reach the subscription repository through Riverpod, so a test
// override replaces it on every auth path that uses it.
import 'package:fitcheck_ai/core/providers.dart' show noRetry;
import 'package:fitcheck_ai/features/auth/providers/auth_provider.dart';
import 'package:fitcheck_ai/features/auth/views/register_page.dart';
import 'package:fitcheck_ai/features/subscription/models/subscription_model.dart';
import 'package:fitcheck_ai/features/subscription/providers/subscription_providers.dart';
import 'package:fitcheck_ai/features/subscription/repositories/subscription_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../visual/visual_harness.dart';

class _RecordingSubscriptionRepository extends SubscriptionRepository {
  final List<String> validated = [];
  final List<String> redeemed = [];

  @override
  Future<ValidateReferralResponse> validateReferralCode(String code) async {
    validated.add(code);
    return const ValidateReferralResponse(valid: true, referrerName: 'Ana');
  }

  @override
  Future<bool> redeemReferralCode(String code) async {
    redeemed.add(code);
    return true;
  }
}

void main() {
  setUpAll(loadAppFonts);

  test('user initialization redeems through the injected repository', () async {
    final repo = _RecordingSubscriptionRepository();
    final container = ProviderContainer(
      retry: noRetry,
      overrides: [subscriptionRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(container.dispose);

    final redeemed = await container
        .read(userInitializationServiceProvider)
        .redeemReferralCode('FIT-ABC123');

    expect(redeemed, isTrue);
    expect(repo.redeemed, ['FIT-ABC123']);
  });

  testWidgets(
    'register checks a referral code through the injected repository',
    (tester) async {
      final repo = _RecordingSubscriptionRepository();
      await pumpPhone(
        tester,
        const RegisterPage(),
        overrides: [subscriptionRepositoryProvider.overrideWithValue(repo)],
      );

      final referralField = find.ancestor(
        of: find.byIcon(Icons.redeem_outlined),
        matching: find.byType(TextFormField),
      );
      await tester.enterText(referralField, 'FIT-ABC123');
      await tester.pump(const Duration(milliseconds: 600));

      expect(repo.validated, ['FIT-ABC123']);
    },
  );
}
