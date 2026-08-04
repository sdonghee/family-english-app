import '../models/user_profile.dart';

class RewardResult {
  final int xpEarned;
  final bool didLevelUp;
  final int newLevel;
  final List<String> newlyUnlockedBadges;
  final List<String> completedQuests;

  RewardResult({
    required this.xpEarned,
    required this.didLevelUp,
    required this.newLevel,
    required this.newlyUnlockedBadges,
    required this.completedQuests,
  });
}

class GamificationService {
  /// 메시지 작성 및 대화 완료 시 XP 획득 및 퀘스트/배지 계산
  RewardResult processMessageReward({
    required UserProfile profile,
    required String userMessage,
  }) {
    // 기본 대화 XP: 20 XP + 문장 길이에 따른 추가 XP (최대 10)
    int baseEarned = 20;
    if (userMessage.split(' ').length >= 4) {
      baseEarned += 10;
    }

    final bool levelUp = profile.addXp(baseEarned);
    final List<String> newBadges = [];
    final List<String> completedQuestTitles = [];

    // 일일 퀘스트 업데이트
    for (var quest in profile.dailyQuests) {
      if (!quest.isCompleted && quest.id == 'q1') {
        quest.currentCount++;
        if (quest.currentCount >= quest.targetCount) {
          quest.isCompleted = true;
          profile.addXp(quest.rewardXp);
          completedQuestTitles.add(quest.title);
        }
      }
    }

    // 배지 해금 로직 검서
    if (profile.level >= 5 && !profile.badges.contains('👑 어휘의 달인')) {
      profile.badges.add('👑 어휘의 달인');
      newBadges.add('👑 어휘의 달인');
    }
    if (profile.totalXp >= 500 && !profile.badges.contains('🔥 열정 수다쟁이')) {
      profile.badges.add('🔥 열정 수다쟁이');
      newBadges.add('🔥 열정 수다쟁이');
    }

    return RewardResult(
      xpEarned: baseEarned,
      didLevelUp: levelUp,
      newLevel: profile.level,
      newlyUnlockedBadges: newBadges,
      completedQuests: completedQuestTitles,
    );
  }
}
