import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService, UserProfile } from '../services/user.service';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
    private userService = inject(UserService);
    private authService = inject(AuthService);
    private router = inject(Router);

    isEditing = false;
    editData = { username: '', email: '', about: '', preferredLanguage: 'en' };
    successMessage = '';
    errorMessage = '';
    user: UserProfile | null = null;

    ngOnInit() {
        this.userService.getProfile().subscribe({
            next: () => {
                this.user = this.userService.profile();
                this.resetEditData();
            },
            error: (err: any) => this.errorMessage = err.error?.message || 'Failed to load profile'
        });
    }

    resetEditData() {
        if (this.user) {
            this.editData = {
                username: this.user.username || '',
                email: this.user.email || '',
                about: this.user.about || '',
                preferredLanguage: this.user.preferredLanguage || 'en'
            };
        }
    }

    toggleEdit() {
        this.isEditing = !this.isEditing;
        this.successMessage = '';
        this.errorMessage = '';
        if (!this.isEditing) this.resetEditData();
    }

    saveProfile() {
        this.userService.updateProfile(this.editData).subscribe({
            next: (res: any) => {
                this.user = this.userService.profile();
                this.isEditing = false;
                this.successMessage = 'Profile updated successfully!';
                this.authService.currentUser.set(res.user);
                setTimeout(() => this.successMessage = '', 3000);
            },
            error: (err: any) => this.errorMessage = err.error?.message || 'Failed to update profile'
        });
    }

    goBack() {
        this.router.navigate(['/chat']);
    }

    getInitials(): string {
        if (!this.user) return '?';
        return this.user.username?.charAt(0)?.toUpperCase() || '?';
    }

    getJoinDate(): string {
        if (!this.user?.createdAt) return '';
        return new Date(this.user.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}
