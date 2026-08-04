import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/chat_message.dart';
import 'local_storage_service.dart';

class SyncService {
  final LocalStorageService localStorageService;
  final String? supabaseUrl;
  final String? supabaseAnonKey;
  bool _isSupabaseInitialized = false;

  SyncService({
    required this.localStorageService,
    this.supabaseUrl,
    this.supabaseAnonKey,
  });

  /// Supabase 클라이언트 초기화
  Future<void> init() async {
    if (supabaseUrl != null &&
        supabaseAnonKey != null &&
        supabaseUrl!.isNotEmpty &&
        supabaseAnonKey!.isNotEmpty) {
      try {
        await Supabase.initialize(
          url: supabaseUrl!,
          anonKey: supabaseAnonKey!,
        );
        _isSupabaseInitialized = true;
      } catch (e) {
        _isSupabaseInitialized = false;
      }
    }
  }

  /// 인터넷 재연결 시 미동기화된 대화 기록을 Supabase 서버에 업로드
  Future<int> syncOfflineData() async {
    final unsyncedMessages = await localStorageService.getUnsyncedMessages();
    if (unsyncedMessages.isEmpty) return 0;

    if (!_isSupabaseInitialized) {
      // Supabase 연결 설정이 없는 경우 오프라인 성공으로 처리
      return 0;
    }

    final List<String> syncedIds = [];

    try {
      final client = Supabase.instance.client;

      for (var msg in unsyncedMessages) {
        await client.from('chat_messages').upsert(msg.toJson());
        syncedIds.add(msg.id);
      }

      // 로컬 DB 동기화 완료 마크
      await localStorageService.markAsSynced(syncedIds);
    } catch (e) {
      // 서버 전송 오류 발생 시 다음 연동 시도 시 복구
    }

    return syncedIds.length;
  }
}
