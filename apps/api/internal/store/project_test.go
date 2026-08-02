package store

import (
	"testing"
)

func TestNormalizeRepoURL(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"already canonical", "https://github.com/user/repo", "https://github.com/user/repo"},
		{"trailing .git", "https://github.com/user/repo.git", "https://github.com/user/repo"},
		{"trailing slash", "https://github.com/user/repo/", "https://github.com/user/repo"},
		{"trailing .git and slash", "https://github.com/user/repo.git/", "https://github.com/user/repo"},
		{"uppercase", "https://github.com/User/Repo", "https://github.com/user/repo"},
		{"ssh to https", "git@github.com:user/repo", "https://github.com/user/repo"},
		{"ssh with .git", "git@github.com:user/repo.git", "https://github.com/user/repo"},
		{"http to https", "http://github.com/user/repo", "https://github.com/user/repo"},
		{"whitespace", "  https://github.com/user/repo  ", "https://github.com/user/repo"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeRepoURL(tt.input)
			if got != tt.want {
				t.Fatalf("normalizeRepoURL(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestCreateProjectNormalizesRepoURL(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	project, err := db.CreateProject(user.ID, "test", "https://github.com/User/Repo.git/")
	if err != nil {
		t.Fatal(err)
	}

	if project.RepoURL != "https://github.com/user/repo" {
		t.Fatalf("expected normalized URL, got %q", project.RepoURL)
	}
}

func TestCreateProjectDuplicateRepoURL(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.CreateProject(user.ID, "first", "https://github.com/user/repo")
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.CreateProject(user.ID, "second", "https://github.com/user/repo")
	if err == nil {
		t.Fatal("expected error for duplicate repo_url")
	}
}

func TestCreateProjectDuplicateRepoURLDifferentForm(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.CreateProject(user.ID, "first", "https://github.com/user/repo")
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.CreateProject(user.ID, "second", "https://github.com/user/repo.git")
	if err == nil {
		t.Fatal("expected error for duplicate repo_url with different form")
	}
}

func TestCreateProjectSameRepoURLDifferentUsers(t *testing.T) {
	db := setupTest(t)

	alice, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	bob, err := db.CreateUser("bob", "password456", []byte("dek2"), []byte("salt2"))
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.CreateProject(alice.ID, "alice-project", "https://github.com/user/repo")
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.CreateProject(bob.ID, "bob-project", "https://github.com/user/repo")
	if err != nil {
		t.Fatalf("different users should be able to use the same repo_url: %v", err)
	}
}
