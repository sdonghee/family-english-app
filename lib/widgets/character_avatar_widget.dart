import 'package:flutter/material.dart';
import '../providers/chat_provider.dart';

class CharacterAvatarWidget extends StatefulWidget {
  final CharacterEmotion emotion;

  const CharacterAvatarWidget({Key? key, required this.emotion}) : super(key: key);

  @override
  State<CharacterAvatarWidget> createState() => _CharacterAvatarWidgetState();
}

class _CharacterAvatarWidgetState extends State<CharacterAvatarWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _scaleAnimation = Tween<double>(begin: 0.96, end: 1.04).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    String emoji = '🤖';
    String statusText = '대화 준비 완료!';
    Color accentColor = const Color(0xFF6C5CE7);

    switch (widget.emotion) {
      case CharacterEmotion.thinking:
        emoji = '🤔';
        statusText = 'Lingo가 생각 중이에요...';
        accentColor = const Color(0xFFFDCB6E);
        break;
      case CharacterEmotion.speaking:
        emoji = '😃';
        statusText = 'Lingo가 이야기하고 있어요!';
        accentColor = const Color(0xFF00CEC9);
        break;
      case CharacterEmotion.cheering:
        emoji = '🎉';
        statusText = '참 잘했어요! 레벨 업!';
        accentColor = const Color(0xFFFF7675);
        break;
      case CharacterEmotion.idle:
      default:
        emoji = '🐶';
        statusText = 'Lingo 선생님과 영어 수다 떨기!';
        accentColor = const Color(0xFF6C5CE7);
        break;
    }

    return AnimatedBuilder(
      animation: _scaleAnimation,
      builder: (context, child) {
        return Transform.scale(
          scale: widget.emotion == CharacterEmotion.thinking
              ? _scaleAnimation.value
              : 1.0,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [accentColor, accentColor.withOpacity(0.7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: accentColor.withOpacity(0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    emoji,
                    style: const TextStyle(fontSize: 40),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  statusText,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: accentColor,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
