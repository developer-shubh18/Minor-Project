import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../environments/environments';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = `${environment.apiUrl}/api/auth`;

  currentUser = signal<any>(null);
  token = signal<string | null>(localStorage.getItem('token'));

  signup(data: any) {
    return this.http.post(`${this.apiUrl}/signup`, data).pipe(
      tap((res: any) => {
        localStorage.setItem('token', res.token);
        this.token.set(res.token);
        this.currentUser.set(res.user);
      })
    );
  }

  login(data: any) {
    return this.http.post(`${this.apiUrl}/login`, data).pipe(
      tap((res: any) => {
        localStorage.setItem('token', res.token);
        this.token.set(res.token);
        this.currentUser.set(res.user);
      })
    );
  }

  logout() {
    localStorage.removeItem('token');
    this.token.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getMe() {
    return this.http.get(`${this.apiUrl}/me`).pipe(
      tap((res: any) => this.currentUser.set(res.user))
    );
  }
}
