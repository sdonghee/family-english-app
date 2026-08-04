enum MessageSender {
  user,
  ai,
  system,
}

class ChatMessage {
  final String id;
  final String profileId;
  final MessageSender sender;
  final String content;
  final String? translation;
  final String? grammarCorrection;
  final int xpEarned;
  final DateTime timestamp;
  bool isSynced;

  ChatMessage({
    required this.id,
    required this.profileId,
    required this.sender,
    required this.content,
    this.translation,
    this.grammarCorrection,
    this.xpEarned = 0,
    required this.timestamp,
    this.isSynced = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'profileId': profileId,
        'sender': sender.name,
        'content': content,
        'translation': translation,
        'grammarCorrection': grammarCorrection,
        'xpEarned': xpEarned,
        'timestamp': timestamp.toIso8601String(),
        'isSynced': isSynced,
      };

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        profileId: json['profileId'] as String,
        sender: MessageSender.values.firstWhere(
          (e) => e.name == json['sender'],
          orElse: () => MessageSender.user,
        ),
        content: json['content'] as String,
        translation: json['translation'] as String?,
        grammarCorrection: json['grammarCorrection'] as String?,
        xpEarned: json['xpEarned'] as int? ?? 0,
        timestamp: DateTime.tryParse(json['timestamp'] as String? ?? '') ?? DateTime.now(),
        isSynced: json['isSynced'] as bool? ?? false,
      );
}
