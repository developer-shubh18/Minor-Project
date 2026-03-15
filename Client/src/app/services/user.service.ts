import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    avatar: string;
    about: string;
    preferredLanguage: string;
    isOnline: boolean;
    lastSeen: string;
    createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
    private http = inject(HttpClient);
    private apiUrl = 'http://localhost:5001/api/users';

    profile = signal<UserProfile | null>(null);

    getProfile() {
        return this.http.get(`${this.apiUrl}/me`).pipe(
            tap((res: any) => this.profile.set(res.user))
        );
    }

    updateProfile(data: any) {
        return this.http.put(`${this.apiUrl}/me`, data).pipe(
            tap((res: any) => this.profile.set(res.user))
        );
    }

    changePassword(currentPassword: string, newPassword: string) {
        return this.http.put(`${this.apiUrl}/me/password`, { currentPassword, newPassword });
    }

    deleteAccount() {
        return this.http.delete(`${this.apiUrl}/me`);
    }
}
