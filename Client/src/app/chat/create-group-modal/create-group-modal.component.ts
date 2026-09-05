import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-create-group-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-group-modal.component.html',
  styleUrl: './create-group-modal.component.css'
})
export class CreateGroupModalComponent {
  private chatService = inject(ChatService);

  @Output() close = new EventEmitter<void>();
  @Output() groupCreated = new EventEmitter<any>();

  groupName = signal('');
  searchQuery = signal('');
  searchResults = signal<any[]>([]);
  selectedUsers = signal<any[]>([]);
  isSubmitting = signal(false);
  errorMessage = signal('');

  onSearchChange(query: string) {
    this.searchQuery.set(query);
    const trimmed = query.trim();
    if (!trimmed) {
      this.searchResults.set([]);
      return;
    }

    this.chatService.searchUsers(trimmed).subscribe({
      next: (res: any) => {
        this.searchResults.set(res.users || []);
      },
      error: () => this.searchResults.set([])
    });
  }

  toggleUser(user: any) {
    this.errorMessage.set('');
    const current = this.selectedUsers();
    const exists = current.some(u => (u._id || u.id) === (user._id || user.id));

    if (exists) {
      this.selectedUsers.set(current.filter(u => (u._id || u.id) !== (user._id || user.id)));
    } else {
      this.selectedUsers.set([...current, user]);
    }
  }

  removeUser(userId: string) {
    this.selectedUsers.update(list => list.filter(u => (u._id || u.id) !== userId));
  }

  isSelected(userId: string): boolean {
    return this.selectedUsers().some(u => (u._id || u.id) === userId);
  }

  onClose() {
    this.close.emit();
  }

  submitGroup() {
    const name = this.groupName().trim();
    const members = this.selectedUsers();

    if (!name) {
      this.errorMessage.set('Please provide a name for the group');
      return;
    }

    if (members.length === 0) {
      this.errorMessage.set('Please select at least one member to add to the group');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const participantIds = members.map(m => m._id || m.id);

    this.chatService.createGroup(name, participantIds).subscribe({
      next: (res: any) => {
        this.isSubmitting.set(false);
        if (res.room) {
          this.chatService.selectRoom(res.room);
          this.groupCreated.emit(res.room);
        }
        this.close.emit();
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to create group. Please try again.');
      }
    });
  }
}
