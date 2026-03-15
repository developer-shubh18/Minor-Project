import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { ChatService } from '../services/chat.service';

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.css'
})
export class SettingsComponent {
    userService = inject(UserService);
    authService = inject(AuthService);
    chatService = inject(ChatService);
    private router = inject(Router);

    showPasswordForm = false;
    showDeleteConfirm = false;
    passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
    successMessage = '';
    errorMessage = '';

    goBack() {
        this.router.navigate(['/chat']);
    }

    goToProfile() {
        this.router.navigate(['/profile']);
    }

    togglePasswordForm() {
        this.showPasswordForm = !this.showPasswordForm;
        this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
        this.clearMessages();
    }

    changePassword() {
        this.clearMessages();
        if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
            this.errorMessage = 'New passwords do not match';
            return;
        }
        if (this.passwordData.newPassword.length < 6) {
            this.errorMessage = 'Password must be at least 6 characters';
            return;
        }
        this.userService.changePassword(this.passwordData.currentPassword, this.passwordData.newPassword).subscribe({
            next: () => {
                this.successMessage = 'Password changed successfully!';
                this.showPasswordForm = false;
                this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
                setTimeout(() => this.successMessage = '', 3000);
            },
            error: (err: any) => this.errorMessage = err.error?.message || 'Failed to change password'
        });
    }

    logout() {
        this.chatService.disconnect();
        this.authService.logout();
    }

    toggleDeleteConfirm() {
        this.showDeleteConfirm = !this.showDeleteConfirm;
    }

    deleteAccount() {
        this.userService.deleteAccount().subscribe({
            next: () => {
                this.chatService.disconnect();
                this.authService.logout();
            },
            error: (err: any) => this.errorMessage = err.error?.message || 'Failed to delete account'
        });
    }

    clearMessages() {
        this.successMessage = '';
        this.errorMessage = '';
    }

    getUserInitial(): string {
        const user = this.authService.currentUser();
        return user?.username?.charAt(0)?.toUpperCase() || '?';
    }

    getUserName(): string {
        const user = this.authService.currentUser();
        return user?.username || 'User';
    }

    getUserEmail(): string {
        const user = this.authService.currentUser();
        return user?.email || '';
    }
}
