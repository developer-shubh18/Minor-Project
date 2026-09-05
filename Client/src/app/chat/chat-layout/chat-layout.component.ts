import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { RoomListComponent } from '../room-list/room-list.component';
import { ChatWindowComponent } from '../chat-window/chat-window.component';
import { UserSearchComponent } from '../user-search/user-search.component';
import { CreateGroupModalComponent } from '../create-group-modal/create-group-modal.component';

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [RoomListComponent, ChatWindowComponent, UserSearchComponent, CreateGroupModalComponent],
  templateUrl: './chat-layout.component.html',
  styleUrl: './chat-layout.component.css'
})
export class ChatLayoutComponent implements OnInit, OnDestroy {
  chatService = inject(ChatService);
  authService = inject(AuthService);
  private router = inject(Router);

  showDropdown = false;
  showGroupModal = signal(false);

  ngOnInit() {
    this.chatService.connect();
    this.chatService.getRooms().subscribe();
    this.authService.getMe().subscribe();
  }

  ngOnDestroy() {
    this.chatService.disconnect();
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  closeDropdown() {
    this.showDropdown = false;
  }

  openGroupModal() {
    this.showDropdown = false;
    this.showGroupModal.set(true);
  }

  closeGroupModal() {
    this.showGroupModal.set(false);
  }

  onGroupCreated(room: any) {
    this.showGroupModal.set(false);
  }

  goToProfile() {
    this.showDropdown = false;
    this.router.navigate(['/profile']);
  }

  goToSettings() {
    this.showDropdown = false;
    this.router.navigate(['/settings']);
  }

  logout() {
    this.showDropdown = false;
    this.chatService.disconnect();
    this.authService.logout();
  }

  getInitials(): string {
    const user = this.authService.currentUser();
    if (!user) return '?';
    return user.username?.charAt(0)?.toUpperCase() || '?';
  }
}
