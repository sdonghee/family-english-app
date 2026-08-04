class DailyQuest {
  final String id;
  final String title;
  final String description;
  final int targetCount;
  int currentCount;
  final int rewardXp;
  bool isCompleted;

  DailyQuest({
    required this.id,
    required this.title,
    required this.description,
    required this.targetCount,
    this.currentCount = 0,
    required this.rewardXp,
    this.isCompleted = false,
  });

  double get progressRatio => (currentCount / targetCount).clamp(0.0, 1.0);

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'targetCount': targetCount,
        'currentCount': currentCount,
        'rewardXp': rewardXp,
        'isCompleted': isCompleted,
      };

  factory DailyQuest.fromJson(Map<String, dynamic> json) => DailyQuest(
        id: json['id'] as String,
        title: json['title'] as String,
        description: json['description'] as String,
        targetCount: json['targetCount'] as int,
        currentCount: json['currentCount'] as int? ?? 0,
        rewardXp: json['rewardXp'] as int,
        isCompleted: json['isCompleted'] as bool? ?? false,
      );
}
