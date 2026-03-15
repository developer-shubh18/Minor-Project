import { Component, inject, ElementRef, ViewChild, AfterViewChecked, computed, OnInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface MessageGroup {
  date: string;
  dateLabel: string;
  messages: any[];
}

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.css'
})
export class ChatWindowComponent implements AfterViewChecked, OnInit {
  chatService = inject(ChatService);
  authService = inject(AuthService);
  translationService = inject(TranslationService);
  messageText = '';
  private typingTimeout: any;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  private shouldScroll = true;

  /** Groups messages by date and marks first/last in consecutive sender groups */
  groupedMessages = computed<MessageGroup[]>(() => {
    const messages = this.chatService.messages();
    if (!messages || messages.length === 0) return [];

    const groups: MessageGroup[] = [];
    let currentDate = '';

    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt);
      const dateKey = msgDate.toDateString();

      if (dateKey !== currentDate) {
        currentDate = dateKey;
        groups.push({
          date: dateKey,
          dateLabel: this.formatDateLabel(msgDate),
          messages: []
        });
      }

      groups[groups.length - 1].messages.push({ ...msg });
    }

    // Mark first/last in consecutive sender groups
    for (const group of groups) {
      for (let i = 0; i < group.messages.length; i++) {
        const msg = group.messages[i];
        const prev = i > 0 ? group.messages[i - 1] : null;
        const next = i < group.messages.length - 1 ? group.messages[i + 1] : null;

        const senderId = msg.sender?._id || msg.sender;
        const prevSenderId = prev ? (prev.sender?._id || prev.sender) : null;
        const nextSenderId = next ? (next.sender?._id || next.sender) : null;

        msg._isFirstInGroup = senderId !== prevSenderId;
        msg._isLastInGroup = senderId !== nextSenderId;
      }
    }

    return groups;
  });

  ngOnInit() {
    // Load supported languages on init
    this.translationService.loadLanguages().subscribe();
  }

  private formatDateLabel(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = today.getTime() - msgDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'TODAY';
    if (diffDays === 1) return 'YESTERDAY';
    if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    }
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).toUpperCase();
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
    }
  }

  scrollToBottom() {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch (e) { }
  }

  sendMessage() {
    const room = this.chatService.currentRoom();
    if (room && this.messageText.trim()) {
      this.chatService.sendMessage(room._id, this.messageText);
      this.messageText = '';
      this.shouldScroll = true;
      this.chatService.emitTyping(room._id, false);
    }
  }

  onTyping() {
    const room = this.chatService.currentRoom();
    if (!room) return;

    this.chatService.emitTyping(room._id, true);
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.chatService.emitTyping(room._id, false);
    }, 2000);
  }

  /** Get message text — checks if showing translated or original */
  getMessageText(msg: any): string {
    const msgId = msg._id;

    // If showing translated version and we have a cached translation
    if (this.translationService.isShowingTranslated(msgId)) {
      const userLang = this.authService.currentUser()?.preferredLanguage || 'en';

      // First check server-side translations array
      const serverTranslation = msg.translations?.find((t: any) => t.language === userLang);
      if (serverTranslation) return serverTranslation.text;

      // Then check client-side cache
      const cached = this.translationService.getCachedTranslation(msgId, userLang);
      if (cached) return cached;
    }

    return msg.originalText;
  }

  /** Check if the message language differs from user's preferred language */
  canTranslate(msg: any): boolean {
    const userLang = this.authService.currentUser()?.preferredLanguage || 'en';
    // If message has originalLanguage and it's different from user's language
    if (msg.originalLanguage && msg.originalLanguage !== userLang) return true;
    // If message has translations available for user's language
    if (msg.translations?.some((t: any) => t.language === userLang)) return true;
    return false;
  }

  /** Toggle translation for a message */
  toggleTranslation(msg: any) {
    const msgId = msg._id;
    const userLang = this.authService.currentUser()?.preferredLanguage || 'en';

    // If currently showing translated, toggle back to original
    if (this.translationService.isShowingTranslated(msgId)) {
      this.translationService.setShowTranslated(msgId, false);
      return;
    }

    // Check if translation already cached (server-side or client-side)
    const serverTranslation = msg.translations?.find((t: any) => t.language === userLang);
    const cachedTranslation = this.translationService.getCachedTranslation(msgId, userLang);

    if (serverTranslation || cachedTranslation) {
      this.translationService.setShowTranslated(msgId, true);
      return;
    }

    // Fetch translation on-demand
    this.translationService.setLoading(msgId, true);
    this.translationService.translate(msg.originalText, userLang, msg.originalLanguage).subscribe({
      next: (result) => {
        this.translationService.cacheTranslation(msgId, userLang, result.translatedText);
        this.translationService.setShowTranslated(msgId, true);
        this.translationService.setLoading(msgId, false);
      },
      error: () => {
        this.translationService.setLoading(msgId, false);
      }
    });
  }

  /** Check if currently showing translated text */
  isShowingTranslated(msg: any): boolean {
    return this.translationService.isShowingTranslated(msg._id);
  }

  /** Check if translation is loading */
  isTranslationLoading(msg: any): boolean {
    return this.translationService.isLoading(msg._id);
  }

  /** Get the translation toggle label */
  getTranslationLabel(msg: any): string {
    if (this.translationService.isLoading(msg._id)) return 'Translating...';
    if (this.translationService.isShowingTranslated(msg._id)) return 'Show original';
    return 'Translate';
  }

  /** Get detected language label */
  getLanguageLabel(msg: any): string {
    if (msg.originalLanguage) {
      return this.translationService.getLanguageName(msg.originalLanguage);
    }
    return '';
  }

  isOwnMessage(msg: any): boolean {
    const user = this.authService.currentUser();
    const currentUserId = user?.id || user?._id;
    const senderId = msg.sender?._id || msg.sender?.id || msg.sender;
    return senderId === currentUserId;
  }

  getRoomDisplayName(): string {
    const room = this.chatService.currentRoom();
    return this.chatService.getRoomDisplayName(room);
  }

  getRoomInitial(): string {
    return this.getRoomDisplayName()?.charAt(0)?.toUpperCase() || '?';
  }

  getStatusText(): string {
    const room = this.chatService.currentRoom();
    if (!room) return '';

    // Check typing users
    const typingUsers = this.chatService.typingUsers();
    if (typingUsers.length > 0) {
      const names = typingUsers.map(u => u.username);
      return names.length === 1 ? `${names[0]} is typing...` : `${names.join(', ')} are typing...`;
    }

    if (room.isGroup) {
      return `${room.participants?.length || 0} members`;
    }

    const partner = this.chatService.getChatPartner(room);
    if (partner?.isOnline) return 'online';
    if (partner?.lastSeen) {
      const lastSeen = new Date(partner.lastSeen);
      const now = new Date();
      const diff = now.getTime() - lastSeen.getTime();
      if (diff < 86400000) {
        return `last seen today at ${lastSeen.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      }
      return `last seen ${lastSeen.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    return 'offline';
  }

  isPartnerOnline(): boolean {
    const room = this.chatService.currentRoom();
    if (!room || room.isGroup) return false;
    const partner = this.chatService.getChatPartner(room);
    return partner?.isOnline || false;
  }
}
