import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/user_profile.dart';
import '../models/chat_message.dart';

class LocalStorageService {
  static const String profileBoxName = 'user_profiles';
  static const String chatBoxName = 'chat_messages';
  static const String metaBoxName = 'app_metadata';

  bool _isInitialized = false;

  /// Hive 데이터베이스 초기화
  Future<void> init() async {
    try {
      await Hive.initFlutter();
      await Hive.openBox(profileBoxName);
      await Hive.openBox(chatBoxName);
      await Hive.openBox(metaBoxName);
      _isInitialized = true;
    } catch (e) {
      // Hive 초기화 실패 시 인메모리 처리로 가볍게 오프라인 대비
      _isInitialized = false;
    }
  }

  /// 프로필 저장
  Future<void> saveProfiles(List<UserProfile> profiles) async {
    if (!_isInitialized) return;
    final box = Hive.box(profileBoxName);
    for (var profile in profiles) {
      await box.put(profile.id, jsonEncode(profile.toJson()));
    }
  }

  /// 특정 프로필 불러오기
  Future<UserProfile?> getProfile(String id) async {
    if (!_isInitialized) return null;
    final box = Hive.box(profileBoxName);
    final data = box.get(id);
    if (data != null) {
      return UserProfile.fromJson(jsonDecode(data));
    }
    return null;
  }

  /// 전체 프로필 불러오기 (없으면 6인 가족 기본 프로필 생성 후 저장)
  Future<List<UserProfile>> loadAllProfiles() async {
    if (!_isInitialized) {
      return UserProfile.getInitialFamilyProfiles();
    }

    final box = Hive.box(profileBoxName);
    if (box.isEmpty) {
      final initialProfiles = UserProfile.getInitialFamilyProfiles();
      await saveProfiles(initialProfiles);
      return initialProfiles;
    }

    final List<UserProfile> list = [];
    for (var key in box.keys) {
      final item = box.get(key);
      if (item != null) {
        list.add(UserProfile.fromJson(jsonDecode(item)));
      }
    }
    return list;
  }

  /// 대화 메시지 저장 (오프라인 캐싱)
  Future<void> saveChatMessage(ChatMessage message) async {
    if (!_isInitialized) return;
    final box = Hive.box(chatBoxName);
    await box.put(message.id, jsonEncode(message.toJson()));
  }

  /// 특정 프로필의 대화 내역 불러오기
  Future<List<ChatMessage>> getChatHistory(String profileId) async {
    if (!_isInitialized) return [];
    final box = Hive.box(chatBoxName);
    final List<ChatMessage> history = [];

    for (var key in box.keys) {
      final item = box.get(key);
      if (item != null) {
        final msg = ChatMessage.fromJson(jsonDecode(item));
        if (msg.profileId == profileId) {
          history.add(msg);
        }
      }
    }

    // 시간순 정렬
    history.sort((a, b) => a.timestamp.compareTo(b.timestamp));
    return history;
  }

  /// 아직 클라우드로 동기화되지 않은 오프라인 대화 내역 가져오기
  Future<List<ChatMessage>> getUnsyncedMessages() async {
    if (!_isInitialized) return [];
    final box = Hive.box(chatBoxName);
    final List<ChatMessage> unsynced = [];

    for (var key in box.keys) {
      final item = box.get(key);
      if (item != null) {
        final msg = ChatMessage.fromJson(jsonDecode(item));
        if (!msg.isSynced) {
          unsynced.add(msg);
        }
      }
    }
    return unsynced;
  }

  /// 동기화 완료 상태 업데이트
  Future<void> markAsSynced(List<String> messageIds) async {
    if (!_isInitialized) return;
    final box = Hive.box(chatBoxName);
    for (var id in messageIds) {
      final item = box.get(id);
      if (item != null) {
        final msg = ChatMessage.fromJson(jsonDecode(item));
        msg.isSynced = true;
        await box.put(id, jsonEncode(msg.toJson()));
      }
    }
  }
}
