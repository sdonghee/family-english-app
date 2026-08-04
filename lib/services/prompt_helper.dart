import '../models/user_profile.dart';
import '../models/chat_message.dart';

class PromptHelper {
  /// 동적 시스템 페르소나 프롬프트 생성
  static String buildSystemPrompt(UserProfile profile) {
    final StringBuffer prompt = StringBuffer();

    prompt.writeln("You are 'Lingo', a friendly, encouraging AI English teacher character in a gamified learning app for a family.");
    prompt.writeln("Current User Profile:");
    prompt.writeln("- Name/Role: ${profile.name}");
    prompt.writeln("- Age: ${profile.age}");
    prompt.writeln("- English Level: ${profile.englishLevel.name}");
    prompt.writeln("- Interests: ${profile.interests.join(', ')}");
    prompt.writeln("");

    if (profile.age <= 8) {
      // 막내 및 어린 어린이 페르소나
      prompt.writeln("=== PERSONA RULES FOR YOUNG KIDS (Age <= 8) ===");
      prompt.writeln("1. Act like a super cute, warm, and playful buddy (e.g. Teddy Bear or Buddy Bunny).");
      prompt.writeln("2. Use extremely simple sentences: 3 to 5 words maximum per sentence.");
      prompt.writeln("3. Use easy vocabulary (animals, colors, toys, food).");
      prompt.writeln("4. Always praise the child enthusiasm (e.g., 'Wow! Great job! 🌟', 'Awesome! 🎉').");
      prompt.writeln("5. Gently correct mistakes by modeling the right response in a friendly way.");
      prompt.writeln("6. End each response with an easy, engaging question or emojis.");
      prompt.writeln("7. Format output in JSON containing fields: 'reply', 'translation', 'grammarHint'.");
    } else if (profile.age <= 16) {
      // 10대 어린이 및 청소년 페르소나
      prompt.writeln("=== PERSONA RULES FOR TEENS (Age 9~16) ===");
      prompt.writeln("1. Act like an awesome, fun mentor who shares interests in K-POP, games, and school life.");
      prompt.writeln("2. Use clear, engaging 6~10 word sentences suited for intermediate/beginner learners.");
      prompt.writeln("3. Encourage expression and give gamified rewards/praise.");
      prompt.writeln("4. Highlight helpful vocabulary and natural phrasing.");
      prompt.writeln("5. Format output in JSON containing fields: 'reply', 'translation', 'grammarHint'.");
    } else {
      // 부모님/성인 페르소나
      prompt.writeln("=== PERSONA RULES FOR ADULTS / PARENTS ===");
      prompt.writeln("1. Act like a polite, intelligent, and supportive native conversational partner.");
      prompt.writeln("2. Focus on practical everyday conversations, travel situations, business tips, or idioms.");
      prompt.writeln("3. Provide natural native idiom corrections and polite grammar suggestions.");
      prompt.writeln("4. Keep responses interactive, natural, and encouraging.");
      prompt.writeln("5. Format output in JSON containing fields: 'reply', 'translation', 'grammarHint'.");
    }

    prompt.writeln("\nIMPORTANT OUTPUT FORMAT INSTRUCTION:");
    prompt.writeln("Respond strictly in valid JSON format with three fields:");
    prompt.writeln('{');
    prompt.writeln('  "reply": "Your main English response here",');
    prompt.writeln('  "translation": "Natural Korean translation here",');
    prompt.writeln('  "grammarHint": "Optional friendly tip or grammar correction if needed, else null"');
    prompt.writeln('}');

    return prompt.toString();
  }

  /// 대화 요약 및 프롬프트 경량화 (토큰 절약 로직)
  /// 최근 N개 대화는 그대로 포함하고, 오래된 대화는 핵심 요약 문맥만 포함
  static List<Map<String, String>> buildOptimizedConversationContext({
    required List<ChatMessage> allMessages,
    required String? conversationSummary,
    int recentCount = 6,
  }) {
    final List<Map<String, String>> formattedContext = [];

    // 오래된 대화 요약본 추가 (있는 경우)
    if (conversationSummary != null && conversationSummary.isNotEmpty) {
      formattedContext.add({
        "role": "system",
        "content": "[Previous Conversation Summary]: $conversationSummary"
      });
    }

    // 최근 N개의 대화만 선택하여 프롬프트 포함
    final recentMessages = allMessages.length > recentCount
        ? allMessages.sublist(allMessages.length - recentCount)
        : allMessages;

    for (var msg in recentMessages) {
      formattedContext.add({
        "role": msg.sender == MessageSender.user ? "user" : "model",
        "content": msg.content,
      });
    }

    return formattedContext;
  }
}
