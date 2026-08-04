import 'package:flutter/foundation.dart';
import '../models/user_profile.dart';
import '../services/local_storage_service.dart';

class ProfileProvider with ChangeNotifier {
  final LocalStorageService localStorageService;

  List<UserProfile> _profiles = [];
  UserProfile? _activeProfile;
  bool _isLoading = true;

  ProfileProvider({required this.localStorageService}) {
    loadProfiles();
  }

  List<UserProfile> get profiles => _profiles;
  UserProfile? get activeProfile => _activeProfile;
  bool get isLoading => _isLoading;

  /// 모든 6인 가족 프로필 로드
  Future<void> loadProfiles() async {
    _isLoading = true;
    notifyListeners();

    _profiles = await localStorageService.loadAllProfiles();
    
    // 기본 선택: 아빠 프로필 또는 첫 번째 프로필
    if (_profiles.isNotEmpty) {
      _activeProfile = _profiles.firstWhere(
        (p) => p.roleKey == 'dad',
        orElse: () => _profiles.first,
      );
    }

    _isLoading = false;
    notifyListeners();
  }

  /// 활성 프로필 변경
  void selectProfile(UserProfile profile) {
    _activeProfile = profile;
    notifyListeners();
  }

  /// 프로필 업데이트 및 DB 저장
  Future<void> updateProfile(UserProfile profile) async {
    final index = _profiles.indexWhere((p) => p.id == profile.id);
    if (index != -1) {
      _profiles[index] = profile;
      if (_activeProfile?.id == profile.id) {
        _activeProfile = profile;
      }
      await localStorageService.saveProfiles(_profiles);
      notifyListeners();
    }
  }
}
