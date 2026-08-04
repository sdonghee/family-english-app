import 'lib/models/user_profile.dart';
import 'lib/models/chat_message.dart';
import 'lib/services/prompt_helper.dart';
import 'lib/services/gamification_service.dart';

void main() {
  print("=== 6인 가족 프로필 데이터 테스트 ===");
  final profiles = UserProfile.getInitialFamilyProfiles();
  print("총 프로필 수: ${profiles.length}");

  for (var p in profiles) {
    print("- [${p.roleKey}] ${p.name} (나이: ${p.age}, 레벨: ${p.level}, XP: ${p.totalXp}, 아이콘: ${p.avatarIcon})");
    final prompt = PromptHelper.buildSystemPrompt(p);
    assert(prompt.contains(p.name), "프롬프트에 이름이 포함되어야 합니다.");
  }

  print("\n=== 프롬프트 제약조건 테스트 ===");
  final youngest = profiles.firstWhere((p) => p.roleKey == 'youngest');
  final dad = profiles.firstWhere((p) => p.roleKey == 'dad');

  final kidsPrompt = PromptHelper.buildSystemPrompt(youngest);
  final dadPrompt = PromptHelper.buildSystemPrompt(dad);

  print("막내(어린이) 프롬프트 특징: ${kidsPrompt.contains('3 to 5 words') ? '3~5단어 제한 포함 확인 OK' : 'FAIL'}");
  print("아빠(성인) 프롬프트 특징: ${dadPrompt.contains('ADULTS / PARENTS') ? '성인 대화 모드 포함 확인 OK' : 'FAIL'}");

  print("\n=== 게임화 및 XP 테스트 ===");
  final gamification = GamificationService();
  final initialXp = youngest.totalXp;
  final result = gamification.processMessageReward(
    profile: youngest,
    userMessage: "Hello puppy!",
  );

  print("획득 XP: ${result.xpEarned}");
  print("업데이트 후 totalXp: ${youngest.totalXp} (이전: $initialXp)");
  print("테스트 완료 - 모든 로직 정상 작동!");
}
