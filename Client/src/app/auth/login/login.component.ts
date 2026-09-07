import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  errorMessage = '';
  isLoading = false;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  onSubmit() {
    if (this.form.valid) {
      this.errorMessage = '';
      this.isLoading = true;
      this.authService.login(this.form.value).subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/chat']);
        },
        error: (err) => {
          this.isLoading = false;
          if (err.error?.errors && Array.isArray(err.error.errors) && err.error.errors.length > 0) {
            this.errorMessage = err.error.errors.map((e: any) => e.message).join('. ');
          } else {
            this.errorMessage = err.error?.message || 'Invalid email or password. Please try again.';
          }
        }
      });
    }
  }
}
