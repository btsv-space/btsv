package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/btsv/btsv/api/internal/handler"
	"github.com/btsv/btsv/api/internal/middleware"
	"github.com/btsv/btsv/api/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	db, err := store.New(dataDir)
	if err != nil {
		log.Fatalf("init db: %v", err)
	}
	defer db.Close()

	cookieDomain := os.Getenv("COOKIE_DOMAIN")
	authHandler := handler.NewAuthHandler(db, cookieDomain)
	projectHandler := handler.NewProjectHandler()
	prefsHandler := handler.NewPreferencesHandler(db)

	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(300 * time.Second))
	allowedOrigin := os.Getenv("ALLOW_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{allowedOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", authHandler.Register)
			r.Post("/login", authHandler.Login)
			r.Post("/logout", authHandler.Logout)

			r.Group(func(r chi.Router) {
				r.Use(middleware.Auth(db))
				r.Get("/me", authHandler.Me)
				r.Post("/change-password", authHandler.ChangePassword)
			})
		})

		r.Route("/projects", func(r chi.Router) {
			r.Use(middleware.Auth(db))

			r.Get("/", projectHandler.List)
			r.Post("/", projectHandler.Create)
			r.Get("/{id}/secret", projectHandler.GetSecret)
			r.Post("/{id}/secret", projectHandler.SetSecret)
		})

		r.Route("/user", func(r chi.Router) {
			r.Use(middleware.Auth(db))

			r.Get("/preferences", prefsHandler.Get)
			r.Patch("/preferences", prefsHandler.Update)
		})
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 300 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		certFile := os.Getenv("TLS_CERT_FILE")
		keyFile := os.Getenv("TLS_KEY_FILE")
		if certFile != "" && keyFile != "" {
			slog.Info("server starting on :" + port + " (TLS)")
			if err := srv.ListenAndServeTLS(certFile, keyFile); err != nil && err != http.ErrServerClosed {
				log.Fatalf("listen TLS: %v", err)
			}
		} else {
			slog.Info("server starting on :" + port)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("listen: %v", err)
			}
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}

	slog.Info("server stopped")
}
