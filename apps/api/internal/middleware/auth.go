package middleware

import (
	"context"
	"net/http"

	"github.com/btsv/btsv/api/internal/store"
)

type contextKey string

const userIDKey contextKey = "userID"
const storeKey contextKey = "store"

func SetStore(ctx context.Context, db *store.DB) context.Context {
	return context.WithValue(ctx, storeKey, db)
}

func GetStore(ctx context.Context) *store.DB {
	db, _ := ctx.Value(storeKey).(*store.DB)
	return db
}

func GetUserID(ctx context.Context) string {
	id, _ := ctx.Value(userIDKey).(string)
	return id
}

func Auth(db *store.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session")
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			session, err := db.GetSession(cookie.Value)
			if err != nil || session == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, session.UserID)
			ctx = SetStore(ctx, db)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func DBAccess(db *store.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := SetStore(r.Context(), db)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
