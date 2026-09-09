import { Component, inject } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-user-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-search.component.html',
  styleUrl: './user-search.component.css'
})
export class UserSearchComponent {
  chatService = inject(ChatService);
  searchQuery = '';
  searchResults: any[] = [];

  search() {
    if (this.searchQuery.trim()) {
      this.chatService.searchUsers(this.searchQuery).subscribe({
        next: (res: any) => this.searchResults = res.users,
        error: () => this.searchResults = []
      });
    } else {
      this.searchResults = [];
    }
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
  }

  startChat(user: any) {
    this.chatService.createRoom([user._id]).subscribe({
      next: (res: any) => {
        // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
          this.searchResults = [];
          this.searchQuery = '';
        });
        
        this.chatService.getRooms().subscribe({
          next: () => {
            if (res.room) {
              this.chatService.selectRoom(res.room);
            }
          }
        });
      }
    });
  }
}
