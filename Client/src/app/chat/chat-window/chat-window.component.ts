import { Component, inject, ElementRef, ViewChild, AfterViewChecked, computed } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
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
export class ChatWindowComponent implements AfterViewChecked {
  chatService = inject(ChatService);
  authService = inject(AuthService);
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

  getMessageText(msg: any) {
    const userLang = this.authService.currentUser()?.preferredLanguage || 'en';
    const translation = msg.translations?.find((t: any) => t.language === userLang);
    return translation?.text || msg.originalText;
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
