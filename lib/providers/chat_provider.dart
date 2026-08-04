import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../models/chat_message.dart';
import '../models/user_profile.dart';
import '../services/gemini_service.dart';
import '../services/local_storage_service.dart';
import '../services/gamification_service.dart';
import '../services/sync_service.dart';

enum CharacterEmotion {
  idle,       // 기본 대기 상태
  thinking,   // AI 생각/로딩 중
  speaking,   // AI 답변 말하는 중
  cheering,   // 칭찬 및 레벨업 축하
}

class ChatProvider with ChangeNotifier {
  final GeminiService geminiService;
  final LocalStorageService localStorageService;
  final GamificationService gamificationService;
  final SyncService syncService;

  List<ChatMessage> _messages = [];
  bool _isLoading = false;
  CharacterEmotion _characterEmotion = CharacterEmotion.idle;
  String? _latestLevelUpNotice;

  ChatProvider({
    required this.geminiService,
    required this.localStorageService,
    required this.gamificationService,
    required this.syncService,
  });

  List<ChatMessage> get messages => _messages;
  bool get isLoading => _isLoading;
  CharacterEmotion get characterEmotion => _characterEmotion;
  String? get latestLevelUpNotice => _latestLevelUpNotice;

  void clearNotice() {
    _latestLevelUpNotice = null;
    notifyListeners();
  }

  /// 특정 사용자 프로필의 대화 내역 불러오기
  Future<void> loadChatHistory(String profileId) async {
    _isLoading = true;
    _characterEmotion = CharacterEmotion.idle;
    notifyListeners();

    _messages = await localStorageService.getChatHistory(profileId);

    _isLoading = false;
    notifyListeners();
  }

  /// 사용자 메시지 전송 및 AI 응답 처리 (오프라인 지원)
  Future<void> sendMessage({
    required UserProfile profile,
    required String text,
    required Function(UserProfile) onProfileUpdated,
  }) async {
    if (text.trim().isEmpty) return;

    final uuid = const Uuid();

    // 1. 사용자 메시지 객체 생성 및 저장
    final userMsg = ChatMessage(
      id: uuid.v4(),
      profileId: profile.id,
      sender: MessageSender.user,
      content: text.trim(),
      timestamp: DateTime.now(),
      isSynced: false,
    );

    _messages.add(userMsg);
    await localStorageService.saveChatMessage(userMsg);

    // 2. 캐릭터 UI 상태를 '생각 중(thinking)'으로 전환
    _characterEmotion = CharacterEmotion.thinking;
    _isLoading = true;
    notifyListeners();

    // 3. 게임화 경험치 처리 및 레벨업 체크
    final reward = gamificationService.processMessageReward(
      profile: profile,
      userMessage: text,
    );

    if (reward.didLevelUp) {
      _latestLevelUpNotice = "🎉 레벨 업! Level ${reward.newLevel}에 도달했습니다!";
      _characterEmotion = CharacterEmotion.cheering;
    }
    await onProfileUpdated(profile);

    // 4. Gemini API 호출 (에러 처리 및 안전한 오프라인 대처)
    try {
      final geminiResp = await geminiService.sendMessage(
        profile: profile,
        userMessage: text,
        history: _messages,
      );

      final aiMsg = ChatMessage(
        id: uuid.v4(),
        profileId: profile.id,
        sender: MessageSender.ai,
        content: geminiResp.reply,
        translation: geminiResp.translation,
        grammarCorrection: geminiResp.grammarHint,
        xpEarned: reward.xpEarned,
        timestamp: DateTime.now(),
        isSynced: false,
      );

      _messages.add(aiMsg);
      await localStorageService.saveChatMessage(aiMsg);

      _characterEmotion = reward.didLevelUp ? CharacterEmotion.cheering : CharacterEmotion.speaking;
    } catch (e) {
      // 에러 발생 시 앱 튕김 방지 및 Fallback 처리
      final fallbackMsg = ChatMessage(
        id: uuid.v4(),
        profileId: profile.id,
        sender: MessageSender.ai,
        content: "Awesome job speaking! Let's keep practicing together! ✨",
        translation: "정말 멋지게 표현했어요! 계속해서 함께 연습해봐요!",
        timestamp: DateTime.now(),
        isSynced: false,
      );

      _messages.add(fallbackMsg);
      await localStorageService.saveChatMessage(fallbackMsg);
      _characterEmotion = CharacterEmotion.idle;
    } finally {
      _isLoading = false;
      notifyListeners();

      // 서버 연결이 있을 때 백그라운드 동기화 시도
      syncService.syncOfflineData();
    }
  }
}
