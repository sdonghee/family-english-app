import 'daily_quest.dart';

enum EnglishLevel {
  beginner,     // 초급
  intermediate, // 중급
  advanced,     // 고급
}

extension EnglishLevelExtension on EnglishLevel {
  String get displayName {
    switch (this) {
      case EnglishLevel.beginner:
        return '초급 (Beginner)';
      case EnglishLevel.intermediate:
        return '중급 (Intermediate)';
      case EnglishLevel.advanced:
        return '고급 (Advanced)';
    }
  }
}

class UserProfile {
  final String id;
  final String name;       // 이름
  final String roleKey;    // dad, mom, child1, child2, child3, youngest
  final int age;           // 만 나이
  final String birthMonthInfo; // 생일 정보 (예: 5월 생일, 9월 생일)
  final EnglishLevel englishLevel;
  final List<String> interests;
  int totalXp;
  int level;
  final List<String> badges;
  final List<DailyQuest> dailyQuests;
  final String avatarIcon;
  final String themeColorHex;

  UserProfile({
    required this.id,
    required this.name,
    required this.roleKey,
    required this.age,
    required this.birthMonthInfo,
    required this.englishLevel,
    required this.interests,
    this.totalXp = 0,
    this.level = 1,
    required this.badges,
    required this.dailyQuests,
    required this.avatarIcon,
    required this.themeColorHex,
  });

  int get xpForNextLevel => level * 100;
  int get currentLevelXp => totalXp % xpForNextLevel;
  double get xpProgress => (currentLevelXp / xpForNextLevel).clamp(0.0, 1.0);

  bool addXp(int amount) {
    totalXp += amount;
    int calculatedLevel = 1;
    int tempXp = totalXp;

    while (tempXp >= calculatedLevel * 100) {
      tempXp -= calculatedLevel * 100;
      calculatedLevel++;
    }

    if (calculatedLevel > level) {
      level = calculatedLevel;
      return true;
    }
    return false;
  }

  /// 6인 가족 맞춤형 프로필 (쌍둥이 하율/예율, 성율, 지율 정확한 나이/생일 적용)
  static List<UserProfile> getInitialFamilyProfiles() {
    return [
      UserProfile(
        id: 'p_dad',
        name: '아빠',
        roleKey: 'dad',
        age: 42,
        birthMonthInfo: '',
        englishLevel: EnglishLevel.intermediate,
        interests: ['비즈니스', '해외여행', 'IT/기술', '일상대화'],
        totalXp: 450,
        level: 3,
        badges: ['🔥 첫 걸음', '✈️ 여행 준비'],
        avatarIcon: '👨‍💼',
        themeColorHex: '#2196F3',
        dailyQuests: _defaultQuests(),
      ),
      UserProfile(
        id: 'p_mom',
        name: '엄마',
        roleKey: 'mom',
        age: 40,
        birthMonthInfo: '',
        englishLevel: EnglishLevel.intermediate,
        interests: ['일상 생활', '요리/맛집', '문화/예술', '여행'],
        totalXp: 380,
        level: 2,
        badges: ['🌱 첫 걸음', '☕ 수다왕'],
        avatarIcon: '👩‍🏫',
        themeColorHex: '#E91E63',
        dailyQuests: _defaultQuests(),
      ),
      UserProfile(
        id: 'p_child1',
        name: '첫째 하율 (쌍둥이)',
        roleKey: 'child1',
        age: 9,
        birthMonthInfo: '5월 생일 (만 9세)',
        englishLevel: EnglishLevel.intermediate,
        interests: ['K-POP', '게임', '학교생활', '친구들'],
        totalXp: 620,
        level: 4,
        badges: ['⭐ 영단어 챔피언', '🎮 퀘스트 마스터'],
        avatarIcon: '👦',
        themeColorHex: '#9C27B0',
        dailyQuests: _defaultQuests(),
      ),
      UserProfile(
        id: 'p_child2',
        name: '둘째 예율 (쌍둥이)',
        roleKey: 'child2',
        age: 9,
        birthMonthInfo: '5월 생일 (만 9세)',
        englishLevel: EnglishLevel.beginner,
        interests: ['그림 그리기', '애니메이션', '동물/자연'],
        totalXp: 210,
        level: 2,
        badges: ['🐣 영어 싹틔우기'],
        avatarIcon: '👧',
        themeColorHex: '#4CAF50',
        dailyQuests: _defaultQuests(),
      ),
      UserProfile(
        id: 'p_child3',
        name: '셋째 성율',
        roleKey: 'child3',
        age: 6,
        birthMonthInfo: '9월 생일 (곧 만 7세!)',
        englishLevel: EnglishLevel.beginner,
        interests: ['공룡', '로봇', '장난감', '만화'],
        totalXp: 150,
        level: 1,
        badges: ['🦖 공룡 탐험가'],
        avatarIcon: '🧒',
        themeColorHex: '#FF9800',
        dailyQuests: _defaultQuests(),
      ),
      UserProfile(
        id: 'p_youngest',
        name: '막내 지율',
        roleKey: 'youngest',
        age: 4,
        birthMonthInfo: '12월 생일 (곧 만 5세!)',
        englishLevel: EnglishLevel.beginner,
        interests: ['귀여운 동물', '동요', '인형놀이'],
        totalXp: 90,
        level: 1,
        badges: ['🎈 탐험가 아기'],
        avatarIcon: '👶',
        themeColorHex: '#00BCD4',
        dailyQuests: _defaultQuests(),
      ),
    ];
  }

  static List<DailyQuest> _defaultQuests() {
    return [
      DailyQuest(
        id: 'q1',
        title: '오늘의 대화하기',
        description: 'AI 선생님과 3문장 이상 대화 나누기',
        targetCount: 3,
        rewardXp: 50,
      ),
      DailyQuest(
        id: 'q2',
        title: '칭찬 받기',
        description: 'AI 선생님에게 참 잘했어요! 칭찬 받기',
        targetCount: 1,
        rewardXp: 30,
      ),
      DailyQuest(
        id: 'q3',
        title: '새로운 단어 익히기',
        description: '새로운 영어 표현 1개 이상 배우기',
        targetCount: 1,
        rewardXp: 40,
      ),
    ];
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'roleKey': roleKey,
        'age': age,
        'birthMonthInfo': birthMonthInfo,
        'englishLevel': englishLevel.name,
        'interests': interests,
        'totalXp': totalXp,
        'level': level,
        'badges': badges,
        'dailyQuests': dailyQuests.map((q) => q.toJson()).toList(),
        'avatarIcon': avatarIcon,
        'themeColorHex': themeColorHex,
      };

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String,
        name: json['name'] as String,
        roleKey: json['roleKey'] as String,
        age: json['age'] as int,
        birthMonthInfo: json['birthMonthInfo'] as String? ?? '',
        englishLevel: EnglishLevel.values.firstWhere(
          (e) => e.name == json['englishLevel'],
          orElse: () => EnglishLevel.beginner,
        ),
        interests: List<String>.from(json['interests'] ?? []),
        totalXp: json['totalXp'] as int? ?? 0,
        level: json['level'] as int? ?? 1,
        badges: List<String>.from(json['badges'] ?? []),
        dailyQuests: (json['dailyQuests'] as List?)
                ?.map((q) => DailyQuest.fromJson(Map<String, dynamic>.from(q)))
                .toList() ??
            _defaultQuests(),
        avatarIcon: json['avatarIcon'] as String? ?? '👤',
        themeColorHex: json['themeColorHex'] as String? ?? '#2196F3',
      );
}
