import { Component, inject, ElementRef, ViewChild, AfterViewChecked, computed, OnInit, signal } from '@angular/core';
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

  // Search functionality
  isSearchOpen = signal(false);
  searchQuery = signal('');

  // Menu functionality
  isMenuOpen = signal(false);

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  private shouldScroll = true;

  /** Groups messages by date and marks first/last in consecutive sender groups */
  groupedMessages = computed<MessageGroup[]>(() => {
    let messages = this.chatService.messages();
    const query = this.searchQuery().toLowerCase().trim();

    // Filter by search query if active
    if (query) {
      messages = messages.filter(m => 
        m.originalText.toLowerCase().includes(query) || 
        m.translations?.some((t: any) => t.text.toLowerCase().includes(query))
      );
    }

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
    const userLang = this.authService.currentUser()?.preferredLanguage || 'en';
    const msgId = msg._id;

    // Check if global translate-all is on OR local toggle is on
    if (this.translationService.translateAll() || this.translationService.isShowingTranslated(msgId)) {
      // First check server-side translations array
      const serverTranslation = msg.translations?.find((t: any) => t.language === userLang);
      if (serverTranslation) return serverTranslation.text;

      // Then check client-side cache
      const cached = this.translationService.getCachedTranslation(msgId, userLang);
      if (cached) return cached;
      
      // If global is on but no translation yet, we could trigger it, 
      // but for better UX we just return original until it's ready.
      if (this.translationService.translateAll()) {
         this.ensureTranslationReady(msg);
      }
    }

    return msg.originalText;
  }

  /** Background translate if missing when Translate All is active */
  private ensureTranslationReady(msg: any) {
    const msgId = msg._id;
    const userLang = this.authService.currentUser()?.preferredLanguage || 'en';
    
    if (this.translationService.getCachedTranslation(msgId, userLang)) return;
    if (this.translationService.isLoading(msgId)) return;
    if (!this.canTranslate(msg)) return;

    this.translationService.setLoading(msgId, true);
    this.translationService.translate(msg.originalText, userLang, msg.originalLanguage).subscribe({
      next: (result) => {
        this.translationService.cacheTranslation(msgId, userLang, result.translatedText);
        this.translationService.setLoading(msgId, false);
      },
      error: () => this.translationService.setLoading(msgId, false)
    });
  }

  /** Check if the message language differs from user's preferred language */
  canTranslate(msg: any): boolean {
    const userLang = this.authService.currentUser()?.preferredLanguage || 'en';
    if (msg.originalLanguage && msg.originalLanguage !== userLang) return true;
    if (msg.translations?.some((t: any) => t.language === userLang)) return true;
    return false;
  }

  toggleTranslationAll() {
    this.translationService.toggleTranslateAll();
  }

  isShowingTranslated(msg: any): boolean {
    return this.translationService.translateAll() || this.translationService.isShowingTranslated(msg._id);
  }

  isTranslationLoading(msg: any): boolean {
    return this.translationService.isLoading(msg._id);
  }

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

    const typingUsers = this.chatService.typingUsers();
    if (typingUsers.length > 0) {
      const names = typingUsers.map(u => u.username);
      return names.length === 1 ? `${names[0]} is typing...` : `${names.join(', ')} are typing...`;
    }

    if (room.isGroup) {
      return `${room.participants?.length || 0} members`;
    }

    if (this.isPartnerOnline()) return 'online';

    const partner = this.chatService.getChatPartner(room);
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
    if (!partner) return false;
    const partnerId = partner._id || partner.id;
    return this.chatService.isUserOnline(partnerId);
  }

  // --- Header Actions ---

  toggleSearch() {
    this.isSearchOpen.update(v => !v);
    if (!this.isSearchOpen()) this.searchQuery.set('');
  }

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  clearChat() {
    const room = this.chatService.currentRoom();
    if (!room) return;
    if (confirm('Are you sure you want to clear this chat? All messages will be deleted.')) {
      this.chatService.clearChat(room._id).subscribe();
      this.isMenuOpen.set(false);
    }
  }

  deleteChat() {
    const room = this.chatService.currentRoom();
    if (!room) return;
    if (confirm('Are you sure you want to delete this chat? The conversation will be removed.')) {
      this.chatService.deleteChat(room._id).subscribe();
      this.isMenuOpen.set(false);
    }
  }

  deleteSingleMessage(msg: any) {
    if (!msg || !msg._id) return;
    const room = this.chatService.currentRoom();
    if (!room) return;

    if (confirm('Delete this message?')) {
      this.chatService.deleteSingleMessage(msg._id, room._id).subscribe({
        error: (err) => {
          console.error('Failed to delete message:', err);
          alert(err?.error?.message || 'Failed to delete message');
        }
      });
    }
  }

  togglePin() {
    const room = this.chatService.currentRoom();
    if (!room) return;
    this.chatService.togglePin(room._id).subscribe();
    this.isMenuOpen.set(false);
  }

  isRoomPinned(): boolean {
    const room = this.chatService.currentRoom();
    if (!room) return false;
    const userId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;
    return room.pinnedBy?.includes(userId) || room.isPinned;
  }
}
