import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/profile_provider.dart';
import '../providers/chat_provider.dart';
import '../models/chat_message.dart';
import '../widgets/character_avatar_widget.dart';
import '../widgets/xp_progress_bar.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({Key? key}) : super(key: key);

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profileProvider = Provider.of<ProfileProvider>(context);
    final chatProvider = Provider.of<ChatProvider>(context);
    final activeProfile = profileProvider.activeProfile;

    if (activeProfile == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('프로필 오류')),
        body: const Center(child: Text('선택된 프로필이 없습니다.')),
      );
    }

    // 레벨업 알림 팝업 체크
    if (chatProvider.latestLevelUpNotice != null) {
      final notice = chatProvider.latestLevelUpNotice;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            title: const Text('🎉 LEVEL UP! 🎉', textAlign: TextAlign.center),
            content: Text(notice!, textAlign: TextAlign.center),
            actions: [
              TextButton(
                onPressed: () {
                  chatProvider.clearNotice();
                  Navigator.of(ctx).pop();
                },
                child: const Text('확인'),
              )
            ],
          ),
        );
      });
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF0F4F8),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Color(0xFF2D3436)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Text(
              activeProfile.avatarIcon,
              style: const TextStyle(fontSize: 24),
            ),
            const SizedBox(width: 8),
            Text(
              '${activeProfile.name} 선생님과의 대화',
              style: const TextStyle(
                color: Color(0xFF2D3436),
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // 상단 XP 진행바 및 AI 캐릭터 애니메이션 헤더
            Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Column(
                children: [
                  XpProgressBar(profile: activeProfile),
                  const SizedBox(height: 10),
                  CharacterAvatarWidget(emotion: chatProvider.characterEmotion),
                ],
              ),
            ),
            const Divider(height: 1),

            // 대화 내역 메시지 리스트
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: chatProvider.messages.length,
                itemBuilder: (context, index) {
                  final msg = chatProvider.messages[index];
                  return _MessageBubble(message: msg);
                },
              ),
            ),

            // 추천 빠른 답장 (아이들/초급자를 위한 퀵 버튼)
            if (activeProfile.age <= 8)
              Container(
                height: 42,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    _QuickReplyChip(
                      text: "Hello!",
                      onTap: () => _sendQuickMessage("Hello!"),
                    ),
                    _QuickReplyChip(
                      text: "I like animals! 🐶",
                      onTap: () => _sendQuickMessage("I like animals!"),
                    ),
                    _QuickReplyChip(
                      text: "Thank you!",
                      onTap: () => _sendQuickMessage("Thank you!"),
                    ),
                  ],
                ),
              ),

            // 하단 입력 창
            Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 6,
                    offset: Offset(0, -2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _handleSend(),
                      decoration: InputDecoration(
                        hintText: activeProfile.age <= 8
                            ? '쉬운 영단어나 문장을 입력해보세요!'
                            : '영어 문장을 입력하세요...',
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        filled: true,
                        fillColor: const Color(0xFFF1F2F6),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: const Color(0xFF6C5CE7),
                    child: chatProvider.isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : IconButton(
                            icon: const Icon(Icons.send_rounded, color: Colors.white),
                            onPressed: _handleSend,
                          ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _sendQuickMessage(String text) {
    _textController.text = text;
    _handleSend();
  }

  void _handleSend() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    final profileProvider = Provider.of<ProfileProvider>(context, listen: false);
    final chatProvider = Provider.of<ChatProvider>(context, listen: false);
    final profile = profileProvider.activeProfile;

    if (profile != null) {
      _textController.clear();
      chatProvider.sendMessage(
        profile: profile,
        text: text,
        onProfileUpdated: (updatedProfile) async {
          await profileProvider.updateProfile(updatedProfile);
        },
      );
      _scrollToBottom();
    }
  }
}

class _QuickReplyChip extends StatelessWidget {
  final String text;
  final VoidCallback onTap;

  const _QuickReplyChip({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ActionChip(
        label: Text(text, style: const TextStyle(fontSize: 12)),
        backgroundColor: const Color(0xFFA29BFE).withOpacity(0.2),
        onPressed: onTap,
      ),
    );
  }
}

class _MessageBubble extends StatefulWidget {
  final ChatMessage message;

  const _MessageBubble({required this.message});

  @override
  State<_MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<_MessageBubble> {
  bool _showTranslation = false;

  @override
  Widget build(BuildContext context) {
    final isUser = widget.message.sender == MessageSender.user;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            const CircleAvatar(
              backgroundColor: Color(0xFF6C5CE7),
              child: Text('🤖', style: TextStyle(fontSize: 18)),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isUser ? const Color(0xFF6C5CE7) : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(isUser ? 18 : 4),
                      bottomRight: Radius.circular(isUser ? 4 : 18),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.04),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.message.content,
                        style: TextStyle(
                          color: isUser ? Colors.white : const Color(0xFF2D3436),
                          fontSize: 15,
                          height: 1.3,
                        ),
                      ),
                      if (widget.message.translation != null &&
                          _showTranslation) ...[
                        const SizedBox(height: 6),
                        Text(
                          widget.message.translation!,
                          style: TextStyle(
                            color: isUser ? Colors.white70 : Colors.grey.shade700,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (!isUser && widget.message.translation != null)
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _showTranslation = !_showTranslation;
                      });
                    },
                    child: Padding(
                      padding: const EdgeInsets.only(top: 4, left: 4),
                      child: Text(
                        _showTranslation ? '번역 숨기기' : '🌐 한글 번역 보기',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xFF6C5CE7),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                if (widget.message.grammarCorrection != null) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF9E6),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.amber.shade300),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.lightbulb, color: Colors.amber, size: 14),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            widget.message.grammarCorrection!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF8A6D3B),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 8),
            const CircleAvatar(
              backgroundColor: Color(0xFFA29BFE),
              child: Text('👤', style: TextStyle(fontSize: 18)),
            ),
          ],
        ],
      ),
    );
  }
}
