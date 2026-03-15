import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = 'http://localhost:5001/api/chat';
  private socket: Socket | null = null;

  rooms = signal<any[]>([]);
  messages = signal<any[]>([]);
  currentRoom = signal<any>(null);
  typingUsers = signal<any[]>([]);
  onlineUsers = signal<Set<string>>(new Set());

  connect() {
    const token = this.authService.token();
    if (!token || this.socket?.connected) return;

    this.socket = io('http://localhost:5001', { auth: { token } });

    this.socket.on('new-message', (msg) => {
      this.messages.update(msgs => [...msgs, msg]);
      // Update the room's last message in sidebar
      this.rooms.update(rooms =>
        rooms.map(r => r._id === msg.room ? { ...r, lastMessage: msg, updatedAt: new Date().toISOString() } : r)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
    });

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

  getMessages(roomId: string) {
    return this.http.get(`${this.apiUrl}/rooms/${roomId}/messages`).pipe(
      tap((res: any) => this.messages.set(res.messages))
    );
  }

  sendMessage(roomId: string, text: string) {
    this.socket?.emit('send-message', { roomId, text });
  }

  joinRoom(roomId: string) {
    this.socket?.emit('join-room', roomId);
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('leave-room', roomId);
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

  selectRoom(room: any) {
    const prevRoom = this.currentRoom();
    if (prevRoom) {
      this.leaveRoom(prevRoom._id);
    }
    this.currentRoom.set(room);
    this.messages.set([]);
    this.typingUsers.set([]);
    this.joinRoom(room._id);
    this.getMessages(room._id).subscribe();
  }

  getChatPartner(room: any): any {
    if (!room || room.isGroup) return null;
    const user = this.authService.currentUser();
    const currentUserId = user?.id || user?._id;
    return room.participants?.find((p: any) => (p._id || p.id) !== currentUserId) || null;
  }

  getRoomDisplayName(room: any): string {
    if (room.isGroup) return room.name;
    const partner = this.getChatPartner(room);
    return partner?.username || room.name;
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers().has(userId);
  }

  clearChat(roomId: string) {
    return this.http.delete(`${this.apiUrl}/rooms/${roomId}/messages`).pipe(
      tap(() => this.messages.set([]))
    );
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

  togglePin(roomId: string) {
    return this.http.post(`${this.apiUrl}/rooms/${roomId}/pin`, {}).pipe(
      tap((res: any) => {
        this.rooms.update(rooms => {
          const updated = rooms.map(r => r._id === roomId ? { ...r, isPinned: res.isPinned } : r);
          // Re-sort with pinned rooms on top
          return updated.sort((a, b) => {
            const userId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;
            const aPinned = a.pinnedBy?.includes(userId) || a.isPinned;
            const bPinned = b.pinnedBy?.includes(userId) || b.isPinned;
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
        });
      })
    );
  }
}
