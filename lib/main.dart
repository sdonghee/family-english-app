import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'services/local_storage_service.dart';
import 'services/gemini_service.dart';
import 'services/sync_service.dart';
import 'services/gamification_service.dart';

import 'providers/profile_provider.dart';
import 'providers/chat_provider.dart';

import 'views/profile_selection_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. 로컬 DB(Hive) 및 클라우드(Supabase) 초기화
  final localStorageService = LocalStorageService();
  await localStorageService.init();

  final syncService = SyncService(
    localStorageService: localStorageService,
    // Supabase URL & Anon Key는 환경변수 또는 실제 값 설정 가능
    supabaseUrl: '',
    supabaseAnonKey: '',
  );
  await syncService.init();

  // 2. Gemini 1.5 Flash 서비스 및 게임화 서비스 준비
  // (API 키가 제공되지 않으면 오프라인 캐시 및 모의 응답으로 안전하게 작동)
  final geminiService = GeminiService(
    apiKey: const String.fromEnvironment('GEMINI_API_KEY', defaultValue: 'YOUR_GEMINI_API_KEY'),
  );

  final gamificationService = GamificationService();

  runApp(
    FamilyAiEnglishApp(
      localStorageService: localStorageService,
      syncService: syncService,
      geminiService: geminiService,
      gamificationService: gamificationService,
    ),
  );
}

class FamilyAiEnglishApp extends StatelessWidget {
  final LocalStorageService localStorageService;
  final SyncService syncService;
  final GeminiService geminiService;
  final GamificationService gamificationService;

  const FamilyAiEnglishApp({
    Key? key,
    required this.localStorageService,
    required this.syncService,
    required this.geminiService,
    required this.gamificationService,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => ProfileProvider(
            localStorageService: localStorageService,
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => ChatProvider(
            geminiService: geminiService,
            localStorageService: localStorageService,
            gamificationService: gamificationService,
            syncService: syncService,
          ),
        ),
      ],
      child: MaterialApp(
        title: '6인 가족 AI 영어 학습 앱',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF6C5CE7),
            brightness: Brightness.light,
          ),
          scaffoldBackgroundColor: const Color(0xFFF7F9FC),
          fontFamily: 'Roboto',
        ),
        home: const ProfileSelectionScreen(),
      ),
    );
  }
}
