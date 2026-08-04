import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/user_profile.dart';
import '../models/chat_message.dart';
import 'prompt_helper.dart';

class GeminiResponse {
  final String reply;
  final String translation;
  final String? grammarHint;

  GeminiResponse({
    required this.reply,
    required this.translation,
    this.grammarHint,
  });
}

class GeminiService {
  final String apiKey;
  // Gemini 1.5 Flash 모델 엔드포인트
  final String _baseUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

  GeminiService({required this.apiKey});

  /// Gemini 1.5 Flash 대화 요청
  Future<GeminiResponse> sendMessage({
    required UserProfile profile,
    required String userMessage,
    required List<ChatMessage> history,
    String? conversationSummary,
  }) async {
    if (apiKey.isEmpty || apiKey == 'YOUR_GEMINI_API_KEY') {
      // API Key가 없거나 오프라인 테스트용 모의(Mock) 응답 반환
      return _generateOfflineOrMockResponse(profile, userMessage);
    }

    try {
      final systemPrompt = PromptHelper.buildSystemPrompt(profile);
      final optimizedContext = PromptHelper.buildOptimizedConversationContext(
        allMessages: history,
        conversationSummary: conversationSummary,
        recentCount: 6,
      );

      // Gemini REST API 요청 데이터 구성
      final List<Map<String, dynamic>> contents = [];

      // 대화 히스토리 구성
      for (var ctx in optimizedContext) {
        if (ctx["role"] == "system") continue;
        contents.add({
          "role": ctx["role"] == "user" ? "user" : "model",
          "parts": [
            {"text": ctx["content"]}
          ]
        });
      }

      // 현재 사용자 메시지 추가
      contents.add({
        "role": "user",
        "parts": [
          {"text": userMessage}
        ]
      });

      final response = await http.post(
        Uri.parse("$_baseUrl?key=$apiKey"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "system_instruction": {
            "parts": [
              {"text": systemPrompt}
            ]
          },
          "contents": contents,
          "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 300,
            "responseMimeType": "application/json",
          }
        }),
      );

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final rawText = decoded['candidates']?[0]?['content']?['parts']?[0]?['text'] ?? '';
        
        return _parseGeminiJson(rawText, profile);
      } else {
        throw Exception("Gemini API Error: ${response.statusCode} - ${response.body}");
      }
    } catch (e) {
      // 네트워크 오류 또는 API 실패 시 앱 튕김 방지 및 오프라인 응답 제공
      return _generateOfflineOrMockResponse(profile, userMessage);
    }
  }

  /// 대화가 길어질 때 토큰 저감을 위해 이전 대화 내역 요약 생성
  Future<String> summarizeConversation(List<ChatMessage> history) async {
    if (history.isEmpty || apiKey.isEmpty) return "";

    try {
      final textHistory = history
          .map((m) => "${m.sender == MessageSender.user ? 'User' : 'AI'}: ${m.content}")
          .join("\n");

      final prompt = "Summarize the key points and learned vocabulary of this English dialogue in 2 short sentences:\n$textHistory";

      final response = await http.post(
        Uri.parse("$_baseUrl?key=$apiKey"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "contents": [
            {
              "parts": [
                {"text": prompt}
              ]
            }
          ],
          "generationConfig": {
            "maxOutputTokens": 100,
          }
        }),
      );

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        return decoded['candidates']?[0]?['content']?['parts']?[0]?['text'] ?? "";
      }
    } catch (_) {}
    return "";
  }

  /// AI JSON 응답 파싱
  GeminiResponse _parseGeminiJson(String rawText, UserProfile profile) {
    try {
      final jsonMap = jsonDecode(rawText);
      return GeminiResponse(
        reply: jsonMap['reply'] ?? "Great job talking with me!",
        translation: jsonMap['translation'] ?? "나와 함께 대화해줘서 고마워요!",
        grammarHint: jsonMap['grammarHint'],
      );
    } catch (_) {
      return GeminiResponse(
        reply: rawText.isNotEmpty ? rawText : "Awesome! Keep it up!",
        translation: "참 잘했어요! 계속해봐요!",
      );
    }
  }

  /// 오프라인 또는 API 미설정 상태일 때 친절한 대안 응답
  GeminiResponse _generateOfflineOrMockResponse(UserProfile profile, String userMsg) {
    if (profile.age <= 8) {
      return GeminiResponse(
        reply: "Wow! I like '${userMsg.length > 15 ? 'your sentence' : userMsg}'! 🌟",
        translation: "와! 말해줘서 정말 고마워요! 🌟 (오프라인 모드)",
        grammarHint: "Tip: 참 잘했어요! 더 말해볼까요?",
      );
    } else {
      return GeminiResponse(
        reply: "That's a nice thought! Let's practice more sentences together.",
        translation: "좋은 표현이네요! 더 많은 문장을 함께 연습해봐요. (오프라인 캐시 응답)",
        grammarHint: "Good effort! Keep practicing simple sentence structures.",
      );
    }
  }
}
