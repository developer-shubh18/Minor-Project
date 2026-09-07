import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css'
})
export class SignupComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  errorMessage = '';
  isLoading = false;

  form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    preferredLanguage: ['en']
  });

  onSubmit() {
    if (this.form.valid) {
      this.errorMessage = '';
      this.isLoading = true;
      this.authService.signup(this.form.value).subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/chat']);
        },
        error: (err) => {
          this.isLoading = false;
          if (err.error?.errors && Array.isArray(err.error.errors) && err.error.errors.length > 0) {
            this.errorMessage = err.error.errors.map((e: any) => e.message).join('. ');
          } else {
            this.errorMessage = err.error?.message || 'Registration failed. Please try again.';
          }
        }
      });
    }
  }
}
