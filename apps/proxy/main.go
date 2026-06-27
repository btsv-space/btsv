package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var (
	allowOrigin     string
	insecureOrigins []string
	logLevel        string
	listenAddr      string
)

var allowHeaders = []string{
	"accept-encoding", "accept-language", "accept",
	"access-control-allow-origin", "authorization", "cache-control",
	"connection", "content-length", "content-type", "dnt",
	"git-protocol", "pragma", "range", "referer",
	"user-agent", "x-authorization", "x-http-method-override",
	"x-requested-with",
}

var exposeHeaders = []string{
	"accept-ranges", "age", "cache-control", "content-length",
	"content-language", "content-type", "date", "etag",
	"expires", "last-modified", "location", "pragma",
	"server", "transfer-encoding", "vary", "x-github-request-id",
	"x-redirected-url",
}

func init() {
	flag.StringVar(&listenAddr, "p", envOrDefault("PORT", "9999"), "port to listen on")
	flag.StringVar(&logLevel, "log-level", envOrDefault("LOG_LEVEL", "info"), "log level: quiet, info, verbose, debug")

	allowOrigin = envOrDefault("ALLOW_ORIGIN", "*")
	insecureOrigins = splitEnv("INSECURE_HTTP_ORIGINS")
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func splitEnv(key string) []string {
	v := os.Getenv(key)
	if v == "" {
		return nil
	}
	return strings.Split(v, ",")
}

func isAllowed(method, contentType, path, service string) bool {
	isInfoRefs := strings.HasSuffix(path, "/info/refs") &&
		(service == "git-upload-pack" || service == "git-receive-pack")

	switch method {
	case "OPTIONS":
		if isInfoRefs {
			return true
		}
		return strings.HasSuffix(path, "git-upload-pack") || strings.HasSuffix(path, "git-receive-pack")
	case "POST":
		return (contentType == "application/x-git-upload-pack-request" && strings.HasSuffix(path, "git-upload-pack")) ||
			(contentType == "application/x-git-receive-pack-request" && strings.HasSuffix(path, "git-receive-pack"))
	case "GET":
		return isInfoRefs
	default:
		return false
	}
}

func verbosef(format string, args ...any) {
	if logLevel == "verbose" || logLevel == "debug" {
		log.Printf(format, args...)
	}
}

func debugf(format string, args ...any) {
	if logLevel == "debug" {
		log.Printf(format, args...)
	}
}

func main() {
	flag.Parse()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// CORS headers
		w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		w.Header().Set("Access-Control-Expose-Headers", strings.Join(exposeHeaders, ","))

		// Preflight
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", strings.Join(allowHeaders, ","))
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusOK)
			return
		}

		// Landing page
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, landingPage())
			return
		}

		path := r.URL.Path
		service := r.URL.Query().Get("service")

		if !isAllowed(r.Method, r.Header.Get("Content-Type"), path, service) {
			verbosef("forbidden %s %s (content-type=%q, service=%q)", r.Method, path, r.Header.Get("Content-Type"), service)
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		// Parse /hostname/rest/of/path
		trimmed := strings.TrimPrefix(path, "/")
		slash := strings.IndexByte(trimmed, '/')
		if slash == -1 {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		hostname := trimmed[:slash]
		remaining := trimmed[slash+1:]

		scheme := "https"
		for _, o := range insecureOrigins {
			if o == hostname {
				scheme = "http"
				break
			}
		}

		targetURL := scheme + "://" + hostname + "/" + remaining
		if r.URL.RawQuery != "" {
			targetURL += "?" + r.URL.RawQuery
		}

		verbosef(">>> %s %s -> %s", r.Method, r.URL.RequestURI(), targetURL)

		// Build request headers (only forward allowed headers)
		reqHeaders := make(http.Header)
		for _, h := range allowHeaders {
			if v := r.Header.Get(h); v != "" {
				reqHeaders.Set(h, v)
			}
		}

		ua := reqHeaders.Get("User-Agent")
		if !strings.HasPrefix(ua, "git/") {
			reqHeaders.Set("User-Agent", "git/@isomorphic-git/cors-proxy")
		}

		debugf("    request headers: %v", reqHeaders)

		// Upstream request (don't follow redirects — isomorphic-git handles them via the proxy)
		upstreamReq, err := http.NewRequest(r.Method, targetURL, r.Body)
		if err != nil {
			log.Printf("error creating upstream request: %v", err)
			http.Error(w, "Bad Gateway", http.StatusBadGateway)
			return
		}
		upstreamReq.Header = reqHeaders

		client := &http.Client{
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
			Timeout: 120 * time.Second,
		}

		resp, err := client.Do(upstreamReq)
		if err != nil {
			log.Printf("error proxying %s %s: %v", r.Method, targetURL, err)
			http.Error(w, "Bad Gateway", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		elapsed := time.Since(start)
		verbosef("<<< %s %s -> %d (%s)", r.Method, r.URL.RequestURI(), resp.StatusCode, elapsed)
		debugf("    upstream headers: %v", resp.Header)

		// Copy allowed response headers
		for _, h := range exposeHeaders {
			if h == "content-length" {
				continue
			}
			if v := resp.Header.Get(h); v != "" {
				if h == "location" {
					// Rewrite redirect location so client goes through the proxy
					v = strings.TrimPrefix(strings.TrimPrefix(v, "https:/"), "http:/")
					if !strings.HasPrefix(v, "/") {
						v = "/" + v
					}
				}
				w.Header().Set(h, v)
			}
		}

		w.WriteHeader(resp.StatusCode)
		n, _ := io.Copy(w, resp.Body)
		debugf("    wrote %d bytes", n)
	})

	addr := ":" + listenAddr
	log.Printf("cors-proxy listening on %s (log_level=%s)", addr, logLevel)

	certFile := os.Getenv("TLS_CERT_FILE")
	keyFile := os.Getenv("TLS_KEY_FILE")
	if certFile != "" && keyFile != "" {
		if err := http.ListenAndServeTLS(addr, certFile, keyFile, handler); err != nil {
			log.Fatalf("server error: %v", err)
		}
	} else {
		if err := http.ListenAndServe(addr, handler); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}
}

func landingPage() string {
	return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>CORS Proxy</title></head>
<body>
<h1>CORS Proxy</h1>
<p>This is a CORS proxy for <a href="https://isomorphic-git.org">isomorphic-git</a>.</p>
<p>Allowed origin: ` + allowOrigin + `</p>
</body>
</html>`
}
