import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/services/ai_consent_service.dart';
import '../../../core/utils/error_handler.dart';
import '../../../core/utils/permission_helper.dart';
import '../repositories/tryon_repository.dart';

final tryOnRepositoryProvider = Provider<TryOnRepository>(
  (ref) => TryOnRepository(),
);

final tryOnImagePickerProvider = Provider<ImagePicker>((ref) => ImagePicker());

Future<bool> _aiConsent(Ref ref) => ref
    .read(aiConsentServiceProvider)
    .ensureConsent(
      featureLabel: ErrorHandler.l10n?.tryonConsentFeatureLabel ?? 'Virtual Try-On',
    );

// Avatar ----------------------------------------------------------------------

@immutable
class TryOnAvatar {
  const TryOnAvatar({this.url, this.pendingPath});

  /// Stored avatar URL. Null when the user has none.
  final String? url;

  /// Local photo shown while it uploads.
  final String? pendingPath;

  bool get isUploading => pendingPath != null;
  bool get isReady => url != null && pendingPath == null;
}

/// The user's avatar for the try-on page.
final tryOnAvatarProvider =
    AsyncNotifierProvider.autoDispose<TryOnAvatarNotifier, TryOnAvatar>(
      TryOnAvatarNotifier.new,
    );

class TryOnAvatarNotifier extends AsyncNotifier<TryOnAvatar> {
  TryOnRepository get _repo => ref.read(tryOnRepositoryProvider);

  @override
  Future<TryOnAvatar> build() async => TryOnAvatar(
    url: await ref.watch(tryOnRepositoryProvider).fetchAvatarUrl(),
  );

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () async => TryOnAvatar(url: await _repo.fetchAvatarUrl()),
    );
  }

  /// Picks a photo and uploads it. A failure keeps the previous avatar.
  Future<void> upload() async {
    final current = state.value;
    if (current?.isUploading ?? false) return;
    // The avatar (a face photo) is sent to AI providers (Apple 5.1.2(i)).
    if (!await _aiConsent(ref)) return;
    if (!await PermissionHelper.confirmPhotoRationale()) return;
    final XFile? picked;
    try {
      picked = await ref
          .read(tryOnImagePickerProvider)
          .pickImage(
            source: ImageSource.gallery,
            maxWidth: 800,
            maxHeight: 800,
            imageQuality: 80,
          );
    } catch (_) {
      await PermissionHelper.showDeniedRecovery(permissionName: 'Photos');
      return;
    }
    if (picked == null || !ref.mounted) return;
    state = AsyncData(TryOnAvatar(url: current?.url, pendingPath: picked.path));
    try {
      final url = await _repo.uploadAvatar(picked.path);
      if (!ref.mounted) return;
      state = AsyncData(TryOnAvatar(url: url));
      ErrorHandler.showSuccess(
        ErrorHandler.l10n?.tryonAvatarUpdatedBody ?? 'Your photo is updated.',
        title: ErrorHandler.l10n?.tryonSavedTitle ?? 'Saved',
      );
    } catch (e, stack) {
      if (!ref.mounted) return;
      state = AsyncData(TryOnAvatar(url: current?.url));
      ErrorHandler.showError(
        e,
        title: ErrorHandler.l10n?.tryonUploadFailedTitle ?? 'Upload failed',
        stackTrace: stack,
      );
    }
  }
}

// Try-on ----------------------------------------------------------------------

const _unset = Object();

/// Status of the one try-on run. An enum, not a bool: the view and the
/// notifier read this single field, so no second flag can drift from it.
enum TryOnStatus { idle, generating }

/// Events that move the try-on run between statuses.
enum TryOnEvent { changeGarment, changeOptions, start, succeed, fail }

/// The status after [event] from [from], or null when the event is illegal
/// there. The notifier ignores illegal events.
///
/// | from       | changeGarment, changeOptions | start      | succeed, fail |
/// |------------|------------------------------|------------|---------------|
/// | idle       | idle                         | generating | ignored       |
/// | generating | ignored                      | ignored    | idle          |
@visibleForTesting
TryOnStatus? tryOnTransition(TryOnStatus from, TryOnEvent event) =>
    switch (from) {
      TryOnStatus.idle => switch (event) {
        TryOnEvent.changeGarment ||
        TryOnEvent.changeOptions => TryOnStatus.idle,
        TryOnEvent.start => TryOnStatus.generating,
        TryOnEvent.succeed || TryOnEvent.fail => null,
      },
      TryOnStatus.generating => switch (event) {
        TryOnEvent.succeed || TryOnEvent.fail => TryOnStatus.idle,
        _ => null,
      },
    };

@immutable
class TryOnState {
  const TryOnState({
    this.garment,
    this.style = 'casual',
    this.background = 'studio white',
    this.pose = 'standing front',
    this.status = TryOnStatus.idle,
    this.resultUrl,
    this.resultBytes,
  });

  /// The one garment photo. The API takes a single image.
  final File? garment;
  final String style;
  final String background;
  final String pose;
  final TryOnStatus status;

  /// True while a run is in flight. Derived from [status]; not stored.
  bool get generating => status == TryOnStatus.generating;

  final String? resultUrl;

  /// Decoded once when the result arrives.
  final Uint8List? resultBytes;

  bool get hasResult => resultUrl != null || resultBytes != null;

  TryOnState copyWith({
    Object? garment = _unset,
    String? style,
    String? background,
    String? pose,
    TryOnStatus? status,
    Object? resultUrl = _unset,
    Object? resultBytes = _unset,
  }) => TryOnState(
    garment: identical(garment, _unset) ? this.garment : garment as File?,
    style: style ?? this.style,
    background: background ?? this.background,
    pose: pose ?? this.pose,
    status: status ?? this.status,
    resultUrl: identical(resultUrl, _unset)
        ? this.resultUrl
        : resultUrl as String?,
    resultBytes: identical(resultBytes, _unset)
        ? this.resultBytes
        : resultBytes as Uint8List?,
  );

  /// A new garment makes the old result stale.
  TryOnState withGarment(File? file) =>
      copyWith(garment: file, resultUrl: null, resultBytes: null);
}

final tryOnProvider = NotifierProvider.autoDispose<TryOnNotifier, TryOnState>(
  TryOnNotifier.new,
);

class TryOnNotifier extends Notifier<TryOnState> {
  static const styles = [
    'casual',
    'formal',
    'business',
    'sporty',
    'streetwear',
    'elegant',
  ];
  static const backgrounds = [
    'studio white',
    'studio gray',
    'urban street',
    'nature',
    'minimal',
  ];
  static const poses = ['standing front', 'standing side', 'walking', 'casual'];

  TryOnRepository get _repo => ref.read(tryOnRepositoryProvider);

  @override
  TryOnState build() => const TryOnState();

  /// True when [event] is legal from the current status. Illegal events are
  /// ignored, never thrown.
  bool _allows(TryOnEvent event) =>
      tryOnTransition(state.status, event) != null;

  /// Applies [event] through the transition table. Does nothing when illegal.
  void _advance(TryOnEvent event) {
    final next = tryOnTransition(state.status, event);
    if (next != null) state = state.copyWith(status: next);
  }

  /// Picks one garment photo from the gallery.
  Future<void> pickGarment() => _pick(ImageSource.gallery);

  Future<void> pickGarmentFromCamera() => _pick(ImageSource.camera);

  Future<void> _pick(ImageSource source) async {
    if (!_allows(TryOnEvent.changeGarment)) return;
    final camera = source == ImageSource.camera;
    final allowed = camera
        ? await PermissionHelper.confirmCameraRationale()
        : await PermissionHelper.confirmPhotoRationale();
    if (!allowed) return;
    final XFile? picked;
    try {
      picked = await ref
          .read(tryOnImagePickerProvider)
          .pickImage(
            source: source,
            maxWidth: 1024,
            maxHeight: 1024,
            imageQuality: 85,
          );
    } catch (_) {
      await PermissionHelper.showDeniedRecovery(
        permissionName: camera ? 'Camera' : 'Photos',
      );
      return;
    }
    if (picked != null && ref.mounted) setGarment(File(picked.path));
  }

  /// Sets or clears the garment. A new garment drops the old result.
  void setGarment(File? file) {
    if (!_allows(TryOnEvent.changeGarment)) return;
    state = state.withGarment(file);
  }

  void setStyle(String v) {
    if (!_allows(TryOnEvent.changeOptions)) return;
    state = state.copyWith(style: v);
  }

  void setBackground(String v) {
    if (!_allows(TryOnEvent.changeOptions)) return;
    state = state.copyWith(background: v);
  }

  void setPose(String v) {
    if (!_allows(TryOnEvent.changeOptions)) return;
    state = state.copyWith(pose: v);
  }

  Future<void> generate() async {
    final garment = state.garment;
    if (!_allows(TryOnEvent.start)) return;
    if (garment == null) {
      ErrorHandler.showValidation(
        ErrorHandler.l10n?.tryonChooseGarmentFirstBody ??
            'Choose a garment photo first.',
        title: ErrorHandler.l10n?.tryonNoGarmentTitle ?? 'No garment',
      );
      return;
    }
    final avatar = ref.read(tryOnAvatarProvider).value;
    if (avatar?.isUploading ?? false) {
      ErrorHandler.showValidation(
        ErrorHandler.l10n?.tryonWaitForUploadBody ??
            'Wait for your photo to finish uploading.',
        title: ErrorHandler.l10n?.tryonStillUploadingTitle ?? 'Still uploading',
      );
      return;
    }
    if (avatar?.url == null) {
      ErrorHandler.showValidation(
        ErrorHandler.l10n?.tryonAddYourPhotoFirstBody ??
            'Add a photo of yourself first.',
        title: ErrorHandler.l10n?.tryOnYourPhoto ?? 'Your photo',
      );
      return;
    }
    // Third-party AI consent (Apple 5.1.2(i)) before any image is read.
    if (!await _aiConsent(ref)) return;
    if (!ref.mounted) return;
    // Re-check after the consent await. A second call may have started, or
    // the garment may have changed: the captured garment must still be current.
    if (!_allows(TryOnEvent.start) || state.garment != garment) return;
    _advance(TryOnEvent.start);
    var outcome = TryOnEvent.fail;
    try {
      final bytes = await garment.readAsBytes();
      final encoded = await compute(base64Encode, bytes);
      final result = await _repo.generate(
        TryOnRepository.buildPayload(
          [encoded],
          style: state.style,
          background: state.background,
          pose: state.pose,
        ),
      );
      // The garment changed while this ran: the result is for another one.
      if (!ref.mounted || state.garment != garment) return;
      final url = result['image_url']?.toString();
      final bytesOut = decodeImagePayload(result['image_base64']?.toString());
      if ((url == null || url.isEmpty) && bytesOut == null) {
        throw Exception('No image came back. Please try again.');
      }
      state = state.copyWith(
        resultUrl: (url == null || url.isEmpty) ? null : url,
        resultBytes: bytesOut,
      );
      outcome = TryOnEvent.succeed;
      ErrorHandler.showSuccess(
        ErrorHandler.l10n?.tryonReadyBody ?? 'Your try-on is ready.',
        title: ErrorHandler.l10n?.actionDone ?? 'Done',
      );
    } catch (e, stack) {
      ErrorHandler.showError(
        e,
        title: ErrorHandler.l10n?.tryonFailedTitle ?? 'Try-on failed',
        stackTrace: stack,
      );
    } finally {
      if (ref.mounted) _advance(outcome);
    }
  }

  Future<void> downloadResult() async {
    final s = state;
    if (!s.hasResult) return;
    try {
      final bytes = s.resultBytes ?? await _repo.downloadBytes(s.resultUrl!);
      if (bytes.isEmpty) throw Exception('The image was empty.');
      await _repo.saveToGallery(
        bytes,
        'tryon_${DateTime.now().millisecondsSinceEpoch}',
      );
      ErrorHandler.showSuccess(
        ErrorHandler.l10n?.tryonSavedToGalleryBody ?? 'Saved to your gallery.',
        title: ErrorHandler.l10n?.tryonSavedTitle ?? 'Saved',
      );
    } catch (e, stack) {
      ErrorHandler.showError(
        e,
        title: ErrorHandler.l10n?.tryonNotSavedTitle ?? 'Not saved',
        stackTrace: stack,
      );
    }
  }
}

/// Decodes an inline image payload, with or without a `data:` URI prefix.
/// Returns null for an empty or malformed payload.
@visibleForTesting
Uint8List? decodeImagePayload(String? payload) {
  if (payload == null || payload.isEmpty) return null;
  final comma = payload.indexOf(',');
  final raw = payload.startsWith('data:') && comma != -1
      ? payload.substring(comma + 1)
      : payload;
  try {
    final bytes = base64Decode(raw.trim());
    return bytes.isEmpty ? null : bytes;
  } on FormatException {
    return null;
  }
}
