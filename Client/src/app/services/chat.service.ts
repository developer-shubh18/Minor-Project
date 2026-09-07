import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = `${environment.apiUrl}/chat`;
  private socket: Socket | null = null;

  rooms = signal<any[]>([]);
  messages = signal<any[]>([]);
  currentRoom = signal<any>(null);
  typingUsers = signal<any[]>([]);
  onlineUsers = signal<Set<string>>(new Set());
  moderationAlert = signal<any>(null);
  unreadCounts = signal<Map<string, number>>(new Map());
  connectionStatus = signal<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  hasMoreMessages = signal<boolean>(false);
  loadingOlder = signal<boolean>(false);

  connect() {
    const token = this.authService.token();
    if (!token || this.socket?.connected) return;

    this.socket = io(environment.socketUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    this.socket.on('connect', () => {
      this.connectionStatus.set('connected');
      const active = this.currentRoom();
      if (active) this.joinRoom(active._id);
    });

    this.socket.on('disconnect', () => {
      this.connectionStatus.set('disconnected');
    });

    this.socket.on('connect_error', () => {
      this.connectionStatus.set('reconnecting');
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.connectionStatus.set('reconnecting');
    });

    this.socket.io.on('reconnect', () => {
      this.connectionStatus.set('connected');
      const active = this.currentRoom();
      if (active) this.joinRoom(active._id);
    });

    // Initial online users list on connection
    this.socket.on('initial-online-users', (userIds: string[]) => {
      this.onlineUsers.set(new Set(userIds));
    });

    // Real-time presence broadcasts
    this.socket.on('user-online', (data: any) => {
      this.onlineUsers.update(set => {
        const newSet = new Set(set);
        newSet.add(data.userId);
        return newSet;
      });
    });

    this.socket.on('user-offline', (data: any) => {
      this.onlineUsers.update(set => {
        const newSet = new Set(set);
        newSet.delete(data.userId);
        return newSet;
      });
    });

    // Handle new incoming message
    this.socket.on('new-message', (msg) => {
      const activeRoom = this.currentRoom();
      const currentUserId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;

      // Only append to active messages if user is currently in that room
      if (activeRoom && activeRoom._id === msg.room) {
        this.messages.update(msgs => [...msgs, msg]);
        // If not our own message, automatically mark as read
        const senderId = msg.sender?._id || msg.sender?.id || msg.sender;
        if (senderId !== currentUserId) {
          this.markRead(msg.room);
          if (document.hidden) {
            this.showNotification(msg);
          }
        }
      } else {
        // Increment unread count for non-active room
        const senderId = msg.sender?._id || msg.sender?.id || msg.sender;
        if (senderId !== currentUserId) {
          this.incrementUnread(msg.room);
          this.showNotification(msg);
        }
      }

      // Update room preview in sidebar
      this.updateRoomLastMessage(msg.room, msg);
    });

    // Handle reaction update broadcast
    this.socket.on('reaction-updated', (data: { messageId: string, roomId: string, reactions: any[] }) => {
      const activeRoom = this.currentRoom();
      if (activeRoom && activeRoom._id === data.roomId) {
        this.messages.update(msgs =>
          msgs.map(m => (m._id || m.id) === data.messageId ? { ...m, reactions: data.reactions } : m)
        );
      }
    });

    // Handle group details update broadcast
    this.socket.on('group-updated', (data: { roomId: string, room: any }) => {
      this.rooms.update(rooms =>
        rooms.map(r => r._id === data.roomId ? { ...r, ...data.room } : r)
      );
      if (this.currentRoom()?._id === data.roomId) {
        this.currentRoom.update(r => ({ ...r, ...data.room }));
      }
    });

    // Handle member kicked notification
    this.socket.on('member-kicked', (data: { roomId: string, groupName: string }) => {
      this.rooms.update(rooms => rooms.filter(r => r._id !== data.roomId));
      if (this.currentRoom()?._id === data.roomId) {
        this.currentRoom.set(null);
        this.messages.set([]);
      }
    });

    // Handle background room updates from user channel
    this.socket.on('room-updated', (data: { roomId: string, lastMessage: any }) => {
      this.updateRoomLastMessage(data.roomId, data.lastMessage);
    });

    // Handle real-time room creation broadcast
    this.socket.on('room-created', (room: any) => {
      this.rooms.update(rooms => {
        if (!rooms.some(r => r._id === room._id)) {
          return [room, ...rooms];
        }
        return rooms;
      });
    });

    // Handle real-time single message deletion
    this.socket.on('message-deleted', (data: { messageId: string, roomId: string }) => {
      const activeRoom = this.currentRoom();
      if (activeRoom && activeRoom._id === data.roomId) {
        this.messages.update(msgs => msgs.filter(m => (m._id || m.id) !== data.messageId));
      }
    });

    // Handle read receipt confirmations (triggers double-blue ticks)
    this.socket.on('messages-read', (data: { roomId: string, userId: string, readAt: string }) => {
      if (this.currentRoom()?._id === data.roomId) {
        this.messages.update(msgs =>
          msgs.map(m => {
            const readByList = m.readBy || [];
            if (!readByList.some((id: any) => id.toString() === data.userId.toString())) {
              return { ...m, readBy: [...readByList, data.userId] };
            }
            return m;
          })
        );
      }
    });

    // Typing indicators
    this.socket.on('user-typing', (data) => {
      if (data.isTyping) {
        this.typingUsers.update(users => {
          if (!users.find(u => u.userId === data.userId)) {
            return [...users, data];
          }
          return users;
        });
      } else {
        this.typingUsers.update(users => users.filter(u => u.userId !== data.userId));
      }
    });

    // Content moderation alerts (warned, blocked, muted)
    this.socket.on('message-moderated', (data: any) => {
      this.moderationAlert.set(data);
      const dismissTime = data.action === 'warned' ? 8000 : 14000;
      setTimeout(() => {
        this.moderationAlert.set(null);
      }, dismissTime);
    });
  }

  private updateRoomLastMessage(roomId: string, message: any) {
    this.rooms.update(rooms => {
      const roomIndex = rooms.findIndex(r => r._id === roomId);
      if (roomIndex === -1) return rooms;

      const updated = rooms.map(r =>
        r._id === roomId
          ? { ...r, lastMessage: message, updatedAt: message.createdAt || new Date().toISOString() }
          : r
      );

      // Re-sort with pinned rooms first, then by updatedAt
      return updated.sort((a, b) => {
        const userId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;
        const aPinned = a.pinnedBy?.some((id: any) => (id._id || id).toString() === userId?.toString()) || a.isPinned;
        const bPinned = b.pinnedBy?.some((id: any) => (id._id || id).toString() === userId?.toString()) || b.isPinned;
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  getRooms() {
    return this.http.get(`${this.apiUrl}/rooms`).pipe(
      tap((res: any) => this.rooms.set(res.rooms))
    );
  }

  getMessages(roomId: string, before?: string) {
    const url = before
      ? `${this.apiUrl}/rooms/${roomId}/messages?before=${encodeURIComponent(before)}&limit=50`
      : `${this.apiUrl}/rooms/${roomId}/messages?limit=50`;

    return this.http.get(url).pipe(
      tap((res: any) => {
        const fetchedMessages = res.messages || [];
        this.hasMoreMessages.set(res.hasMore || false);
        if (before) {
          this.messages.update(msgs => [...fetchedMessages, ...msgs]);
        } else {
          this.messages.set(fetchedMessages);
          this.markRead(roomId);
        }
      })
    );
  }

  loadOlderMessages(roomId: string) {
    if (this.loadingOlder() || !this.hasMoreMessages()) return;
    const currentMsgs = this.messages();
    if (currentMsgs.length === 0) return;

    const oldestTimestamp = currentMsgs[0].createdAt;
    if (!oldestTimestamp) return;

    this.loadingOlder.set(true);
    this.getMessages(roomId, oldestTimestamp).subscribe({
      next: () => this.loadingOlder.set(false),
      error: () => this.loadingOlder.set(false)
    });
  }

  sendMessage(roomId: string, text = '', media?: any) {
    this.socket?.emit('send-message', { roomId, text, media });
  }

  uploadMedia(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${this.apiUrl}/upload`, formData);
  }

  toggleReaction(messageId: string, roomId: string, emoji: string) {
    this.socket?.emit('toggle-reaction', { messageId, roomId, emoji });
  }

  updateGroup(roomId: string, data: { name?: string, description?: string, avatar?: string }) {
    return this.http.patch<any>(`${this.apiUrl}/groups/${roomId}`, data).pipe(
      tap((res: any) => {
        if (res.room) {
          this.rooms.update(rooms => rooms.map(r => r._id === roomId ? { ...r, ...res.room } : r));
          if (this.currentRoom()?._id === roomId) {
            this.currentRoom.update(r => ({ ...r, ...res.room }));
          }
        }
      })
    );
  }

  removeMember(roomId: string, memberId: string) {
    return this.http.post<any>(`${this.apiUrl}/groups/${roomId}/members/remove`, { memberId }).pipe(
      tap((res: any) => {
        if (res.room) {
          this.rooms.update(rooms => rooms.map(r => r._id === roomId ? { ...r, ...res.room } : r));
          if (this.currentRoom()?._id === roomId) {
            this.currentRoom.update(r => ({ ...r, ...res.room }));
          }
        }
      })
    );
  }

  toggleAdmin(roomId: string, memberId: string, makeAdmin: boolean) {
    return this.http.patch<any>(`${this.apiUrl}/groups/${roomId}/admins`, { memberId, makeAdmin }).pipe(
      tap((res: any) => {
        if (res.room) {
          this.rooms.update(rooms => rooms.map(r => r._id === roomId ? { ...r, ...res.room } : r));
          if (this.currentRoom()?._id === roomId) {
            this.currentRoom.update(r => ({ ...r, ...res.room }));
          }
        }
      })
    );
  }

  leaveGroup(roomId: string) {
    return this.http.post<any>(`${this.apiUrl}/groups/${roomId}/leave`, {}).pipe(
      tap(() => {
        this.rooms.update(rooms => rooms.filter(r => r._id !== roomId));
        if (this.currentRoom()?._id === roomId) {
          this.currentRoom.set(null);
          this.messages.set([]);
        }
      })
    );
  }

  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  private showNotification(msg: any) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const senderName = msg.sender?.username || 'New message';
    let bodyText = msg.originalText;
    if (!bodyText && msg.media) {
      if (msg.media.type === 'image') bodyText = '📷 Sent a photo';
      else if (msg.media.type === 'audio') bodyText = '🎤 Sent a voice note';
      else bodyText = `📎 Sent a file: ${msg.media.name}`;
    }

    try {
      const notification = new Notification(senderName, {
        body: bodyText,
        icon: msg.sender?.avatar || '/favicon.ico'
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (e) {
      console.warn('Web notification error:', e);
    }
  }

  joinRoom(roomId: string) {
    this.socket?.emit('join-room', roomId);
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('leave-room', roomId);
  }

  markRead(roomId: string) {
    if (this.socket?.connected && roomId) {
      this.socket.emit('mark-read', { roomId });
      this.clearUnread(roomId);
    }
  }

  emitTyping(roomId: string, isTyping: boolean) {
    this.socket?.emit('typing', { roomId, isTyping });
  }

  searchUsers(query: string) {
    return this.http.get(`${this.apiUrl}/users/search?q=${query}`);
  }

  createRoom(participantIds: string[], name?: string, isGroup = false) {
    return this.http.post(`${this.apiUrl}/rooms`, { participantIds, name, isGroup });
  }

  createGroup(name: string, participantIds: string[]) {
    return this.createRoom(participantIds, name, true);
  }

  selectRoom(room: any) {
    const prevRoom = this.currentRoom();
    if (prevRoom) {
      this.leaveRoom(prevRoom._id);
    }
    this.currentRoom.set(room);
    this.messages.set([]);
    this.typingUsers.set([]);
    this.clearUnread(room._id);
    this.joinRoom(room._id);
    this.getMessages(room._id).subscribe();
  }

  getChatPartner(room: any): any {
    if (!room || room.isGroup) return null;
    const user = this.authService.currentUser();
    const currentUserId = user?.id || user?._id;
    return room.participants?.find((p: any) => (p._id || p.id).toString() !== currentUserId?.toString()) || null;
  }

  getRoomDisplayName(room: any): string {
    if (!room) return '';
    if (room.isGroup) return room.name;
    const partner = this.getChatPartner(room);
    return partner?.username || room.name;
  }

  isUserOnline(userId: string): boolean {
    if (!userId) return false;
    return this.onlineUsers().has(userId.toString());
  }

  getUnreadCount(roomId: string): number {
    return this.unreadCounts().get(roomId) || 0;
  }

  private incrementUnread(roomId: string) {
    this.unreadCounts.update(map => {
      const newMap = new Map(map);
      const current = newMap.get(roomId) || 0;
      newMap.set(roomId, current + 1);
      return newMap;
    });
  }

  private clearUnread(roomId: string) {
    this.unreadCounts.update(map => {
      const newMap = new Map(map);
      newMap.delete(roomId);
      return newMap;
    });
  }

  deleteChat(roomId: string) {
    return this.http.delete(`${this.apiUrl}/rooms/${roomId}`).pipe(
      tap(() => {
        this.rooms.update(rooms => rooms.filter(r => r._id !== roomId));
        this.currentRoom.set(null);
        this.messages.set([]);
      })
    );
  }

  deleteSingleMessage(messageId: string, roomId: string) {
    return this.http.delete(`${this.apiUrl}/messages/${messageId}`).pipe(
      tap(() => {
        this.messages.update(msgs => msgs.filter(m => (m._id || m.id) !== messageId));
        this.socket?.emit('delete-message', { messageId, roomId });
      })
    );
  }

  togglePin(roomId: string) {
    return this.http.post(`${this.apiUrl}/rooms/${roomId}/pin`, {}).pipe(
      tap((res: any) => {
        this.rooms.update(rooms => {
          const updated = rooms.map(r => r._id === roomId ? { ...r, isPinned: res.isPinned } : r);
          return updated.sort((a, b) => {
            const userId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;
            const aPinned = a.pinnedBy?.some((id: any) => (id._id || id).toString() === userId?.toString()) || a.isPinned;
            const bPinned = b.pinnedBy?.some((id: any) => (id._id || id).toString() === userId?.toString()) || b.isPinned;
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
        });
      })
    );
  }
}
