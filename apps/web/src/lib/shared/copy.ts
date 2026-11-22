import type { TSyncErrorType } from "$lib/shared/types";

export const SECURITY_COPY = {
  setupIntro:
    "Posts live on this device and sync to GitHub. Set a passcode so your GitHub tokens are encrypted at rest.",
  passcodePurpose: "The passcode encrypts your GitHub tokens on this device.",
  noRecovery:
    "There is no recovery: if you forget it, you reset the device and re-enter your tokens.",

  dataIntro:
    "Posts are stored on this device and pushed to your git repo. If you reset the device, synced posts can be retrieved, but unsynced changes will be lost.",
  resetWarning:
    "All data will be removed from this device. This cannot be undone.",
} as const;

export function syncErrorTitle(
  type: TSyncErrorType | null | undefined,
): string {
  switch (type) {
    case "token-invalid":
      return "Token expired";
    case "no-token":
      return "No token";
    case "no-repo-access":
      return "No repo access";
    default:
      return "Sync failed";
  }
}
