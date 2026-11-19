export const SECURITY_COPY = {
  deviceIntro: "Posts live on this device and sync to GitHub.",
  passcodePurpose: "The passcode encrypts your GitHub tokens at rest.",
  noRecovery:
    "There is no recovery: if you forget it, all local data is wiped and you re-enter your GitHub tokens.",
  wipeWarning:
    "All local data is wiped — projects, posts, tokens, and the passcode. Pushed posts can be re-cloned from GitHub; unpushed changes are lost.",
  deleteAllConfirm:
    "Delete all local data? This removes everything on this device and returns to setup. This cannot be undone.",
} as const;
