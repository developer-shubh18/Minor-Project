import { Component, inject, ElementRef, ViewChild, AfterViewChecked, computed, OnInit, signal, OnDestroy } from '@angular/core';
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
export class ChatWindowComponent implements AfterViewChecked, OnInit, OnDestroy {
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

  // Media & Attachment uploading state
  isUploading = signal(false);
  uploadProgressText = signal('');

  // Voice Note Recording state
  isRecording = signal(false);
  recordingDuration = signal(0);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: any = null;

  // Reactions
  availableReactions = ['❤️', '👍', '😂', '🎉', '😮', '😢'];
  activeReactionMenuMsgId = signal<string | null>(null);

  // Group Details Modal
  isGroupModalOpen = signal(false);
  groupEditName = signal('');
  groupEditDesc = signal('');
  groupSaving = signal(false);

  // Lightbox
  lightboxUrl = signal<string | null>(null);
  lightboxName = signal<string>('');

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  private shouldScroll = true;

  /** Groups messages by date and marks first/last in consecutive sender groups */
  groupedMessages = computed<MessageGroup[]>(() => {
    let messages = this.chatService.messages();
    const query = this.searchQuery().toLowerCase().trim();

    // Filter by search query if active
    if (query) {
      messages = messages.filter(m => 
        (m.originalText && m.originalText.toLowerCase().includes(query)) || 
        (m.media?.name && m.media.name.toLowerCase().includes(query)) ||
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

        const senderId = msg.sender?._id || msg.sender?.id || msg.sender;
        const prevSenderId = prev ? (prev.sender?._id || prev.sender?.id || prev.sender) : null;
        const nextSenderId = next ? (next.sender?._id || next.sender?.id || next.sender) : null;

        msg._isFirstInGroup = senderId !== prevSenderId;
        msg._isLastInGroup = senderId !== nextSenderId;
      }
    }

    return groups;
  });

  ngOnInit() {
    this.translationService.loadLanguages().subscribe();
    this.chatService.requestNotificationPermission();
  }

  ngOnDestroy() {
    this.cancelRecording();
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

  // --- Media & File Uploading ---

  triggerFileInput() {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: any) {
    const file: File = event.target.files?.[0];
    if (!file) return;

    const room = this.chatService.currentRoom();
    if (!room) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('File exceeds maximum allowed size of 15MB');
      event.target.value = '';
      return;
    }

    this.isUploading.set(true);
    this.uploadProgressText.set(`Uploading ${file.name}...`);

    this.chatService.uploadMedia(file).subscribe({
      next: (res) => {
        this.isUploading.set(false);
        this.uploadProgressText.set('');
        event.target.value = '';
        if (res.media) {
          this.chatService.sendMessage(room._id, this.messageText.trim(), res.media);
          this.messageText = '';
          this.shouldScroll = true;
        }
      },
      error: (err) => {
        this.isUploading.set(false);
        this.uploadProgressText.set('');
        event.target.value = '';
        alert(err?.error?.message || 'File upload failed');
      }
    });
  }

  // --- Voice Note Recording ---

  async startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Voice recording is not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.recordingDuration.set(0);

      this.recordingTimer = setInterval(() => {
        this.recordingDuration.update(d => d + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Microphone access denied. Please allow microphone permissions to record voice notes.');
    }
  }

  stopRecordingAndSend() {
    if (!this.mediaRecorder || !this.isRecording()) return;

    clearInterval(this.recordingTimer);
    const room = this.chatService.currentRoom();

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const audioFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });

      this.isRecording.set(false);
      this.recordingDuration.set(0);

      if (room) {
        this.isUploading.set(true);
        this.uploadProgressText.set('Sending voice note...');
        this.chatService.uploadMedia(audioFile).subscribe({
          next: (res) => {
            this.isUploading.set(false);
            this.uploadProgressText.set('');
            if (res.media) {
              this.chatService.sendMessage(room._id, '', res.media);
              this.shouldScroll = true;
            }
          },
          error: (err) => {
            this.isUploading.set(false);
            this.uploadProgressText.set('');
            alert(err?.error?.message || 'Failed to send voice note');
          }
        });
      }
    };

    this.mediaRecorder.stop();
  }

  cancelRecording() {
    if (this.recordingTimer) clearInterval(this.recordingTimer);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording.set(false);
    this.recordingDuration.set(0);
    this.audioChunks = [];
  }

  formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // --- Emoji Reactions ---

  toggleReactionMenu(msgId: string, event: MouseEvent) {
    event.stopPropagation();
    if (this.activeReactionMenuMsgId() === msgId) {
      this.activeReactionMenuMsgId.set(null);
    } else {
      this.activeReactionMenuMsgId.set(msgId);
    }
  }

  reactToMessage(msg: any, emoji: string, event?: MouseEvent) {
    if (event) event.stopPropagation();
    const room = this.chatService.currentRoom();
    if (!room || !msg) return;

    this.chatService.toggleReaction(msg._id || msg.id, room._id, emoji);
    this.activeReactionMenuMsgId.set(null);
  }

  getGroupedReactions(reactions: any[]) {
    if (!reactions || reactions.length === 0) return [];

    const currentUserId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;
    const map = new Map<string, { emoji: string, count: number, hasReacted: boolean, users: string[] }>();

    for (const r of reactions) {
      const emoji = r.emoji;
      const rUserId = (r.user?._id || r.user?.id || r.user)?.toString();
      const username = r.user?.username || 'Someone';

      if (!map.has(emoji)) {
        map.set(emoji, { emoji, count: 0, hasReacted: false, users: [] });
      }

      const entry = map.get(emoji)!;
      entry.count++;
      entry.users.push(username);
      if (rUserId === currentUserId?.toString()) {
        entry.hasReacted = true;
      }
    }

    return Array.from(map.values());
  }

  // --- Lightbox ---

  openLightbox(url: string, name = 'Image') {
    this.lightboxUrl.set(url);
    this.lightboxName.set(name);
  }

  closeLightbox() {
    this.lightboxUrl.set(null);
  }

  // --- Group Details & Admin Management ---

  openGroupModal() {
    const room = this.chatService.currentRoom();
    if (!room || !room.isGroup) return;
    this.groupEditName.set(room.name || '');
    this.groupEditDesc.set(room.description || '');
    this.isGroupModalOpen.set(true);
    this.isMenuOpen.set(false);
  }

  closeGroupModal() {
    this.isGroupModalOpen.set(false);
  }

  isCurrentUserAdmin(): boolean {
    const room = this.chatService.currentRoom();
    if (!room || !room.isGroup) return false;
    const userId = (this.authService.currentUser()?.id || this.authService.currentUser()?._id)?.toString();
    const isOwner = (room.createdBy?._id || room.createdBy?.id || room.createdBy)?.toString() === userId;
    const isAdmin = (room.admins || []).some((a: any) => (a._id || a.id || a)?.toString() === userId);
    return isOwner || isAdmin;
  }

  isMemberAdmin(member: any): boolean {
    const room = this.chatService.currentRoom();
    if (!room) return false;
    const memberId = (member._id || member.id || member)?.toString();
    const isOwner = (room.createdBy?._id || room.createdBy?.id || room.createdBy)?.toString() === memberId;
    const isAdmin = (room.admins || []).some((a: any) => (a._id || a.id || a)?.toString() === memberId);
    return isOwner || isAdmin;
  }

  isMemberOwner(member: any): boolean {
    const room = this.chatService.currentRoom();
    if (!room) return false;
    const memberId = (member._id || member.id || member)?.toString();
    return (room.createdBy?._id || room.createdBy?.id || room.createdBy)?.toString() === memberId;
  }

  toggleAdminRole(member: any) {
    const room = this.chatService.currentRoom();
    if (!room) return;
    const memberId = (member._id || member.id || member)?.toString();
    const willBeAdmin = !this.isMemberAdmin(member);

    this.chatService.toggleAdmin(room._id, memberId, willBeAdmin).subscribe({
      error: (err) => alert(err?.error?.message || 'Failed to update admin role')
    });
  }

  kickMember(member: any) {
    const room = this.chatService.currentRoom();
    if (!room) return;
    const memberId = (member._id || member.id || member)?.toString();

    if (confirm(`Remove ${member.username || 'this user'} from the group?`)) {
      this.chatService.removeMember(room._id, memberId).subscribe({
        error: (err) => alert(err?.error?.message || 'Failed to remove member')
      });
    }
  }

  saveGroupInfo() {
    const room = this.chatService.currentRoom();
    if (!room) return;

    this.groupSaving.set(true);
    this.chatService.updateGroup(room._id, {
      name: this.groupEditName().trim(),
      description: this.groupEditDesc().trim()
    }).subscribe({
      next: () => {
        this.groupSaving.set(false);
        this.isGroupModalOpen.set(false);
      },
      error: (err) => {
        this.groupSaving.set(false);
        alert(err?.error?.message || 'Failed to update group details');
      }
    });
  }

  leaveCurrentGroup() {
    const room = this.chatService.currentRoom();
    if (!room) return;

    if (confirm(`Leave "${room.name}"? You will no longer receive messages from this group.`)) {
      this.chatService.leaveGroup(room._id).subscribe({
        next: () => {
          this.isGroupModalOpen.set(false);
        },
        error: (err) => alert(err?.error?.message || 'Failed to leave group')
      });
    }
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- Translation Helpers ---

  getMessageText(msg: any): string {
    const userLang = this.authService.currentUser()?.preferredLanguage || 'en';
    const msgId = msg._id;

    if (this.translationService.translateAll() || this.translationService.isShowingTranslated(msgId)) {
      const serverTranslation = msg.translations?.find((t: any) => t.language === userLang);
      if (serverTranslation) return serverTranslation.text;

      const cached = this.translationService.getCachedTranslation(msgId, userLang);
      if (cached) return cached;
      
      if (this.translationService.translateAll() && msg.originalText) {
         this.ensureTranslationReady(msg);
      }
    }

    return msg.originalText || '';
  }

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

  canTranslate(msg: any): boolean {
    if (!msg.originalText) return false;
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

  getGroupParticipantsText(room?: any): string {
    const targetRoom = room || this.chatService.currentRoom();
    if (!targetRoom || !targetRoom.isGroup) return '';
    const currentUserId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;
    const names = (targetRoom.participants || []).map((p: any) => {
      const pId = p._id || p.id || p;
      if (pId?.toString() === currentUserId?.toString()) return 'You';
      return p.username || 'User';
    });
    return names.join(', ');
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
      const count = room.participants?.length || 0;
      const participantsStr = this.getGroupParticipantsText(room);
      return participantsStr ? `${participantsStr} (${count} members)` : `${count} members`;
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

  loadOlderMessages() {
    const room = this.chatService.currentRoom();
    if (!room) return;
    this.shouldScroll = false;
    const container = this.messagesContainer?.nativeElement;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    this.chatService.loadOlderMessages(room._id);

    setTimeout(() => {
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = (newScrollHeight - prevScrollHeight) + prevScrollTop;
      }
    }, 100);
  }
}
