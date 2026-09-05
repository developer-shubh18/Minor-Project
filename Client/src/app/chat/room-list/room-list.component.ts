import { Component, inject } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-room-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './room-list.component.html',
  styleUrl: './room-list.component.css'
})
export class RoomListComponent {
  chatService = inject(ChatService);
  authService = inject(AuthService);

  selectRoom(room: any) {
    this.chatService.selectRoom(room);
  }

  getRoomName(room: any): string {
    return this.chatService.getRoomDisplayName(room);
  }

  getRoomInitial(room: any): string {
    const name = this.getRoomName(room);
    return name?.charAt(0)?.toUpperCase() || '?';
  }

  getLastMessagePreview(room: any): string {
    if (!room.lastMessage) return 'No messages yet';
    const sender = room.lastMessage.sender?.username || '';
    const text = room.lastMessage.originalText || '';
    if (room.isGroup && sender) {
      return `${sender}: ${text}`;
    }
    return text;
  }

  getLastMessageTime(room: any): string {
    if (!room.lastMessage?.createdAt && !room.updatedAt) return '';
    const date = new Date(room.lastMessage?.createdAt || room.updatedAt);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const oneDay = 86400000;

    if (diff < oneDay && now.getDate() === date.getDate()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } else if (diff < 2 * oneDay) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  isPartnerOnline(room: any): boolean {
    if (room.isGroup) return false;
    const partner = this.chatService.getChatPartner(room);
    if (!partner) return false;
    const partnerId = partner._id || partner.id;
    return this.chatService.isUserOnline(partnerId);
  }

  getUnreadCount(room: any): number {
    return this.chatService.getUnreadCount(room._id);
  }

  isRoomPinned(room: any): boolean {
    const userId = this.authService.currentUser()?.id || this.authService.currentUser()?._id;
    return room.pinnedBy?.some((id: any) => (id._id || id).toString() === userId?.toString()) || room.isPinned;
  }
}
