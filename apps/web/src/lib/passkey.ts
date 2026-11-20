import { base64UrlToBytes, bytesToBase64Url, randomBytes } from "$lib/crypto";
import type { TBytes } from "$lib/shared/types";

const RP_NAME = "btsv";
const PRF_SALT_BYTES = 32;

interface IPrfExtensionOutputs {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

interface IClientCapabilities {
  getClientCapabilities?: () => Promise<Record<string, boolean>>;
}

export interface IRegisteredPasskey {
  /** base64url */
  credentialId: string;
  /** base64url */
  prfSalt: string;
  rpId: string;
  prfOutput: TBytes;
}

export function passkeysSupported(): boolean {
  return (
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

export async function prfSupported(): Promise<boolean> {
  const getCaps = (PublicKeyCredential as unknown as IClientCapabilities)
    .getClientCapabilities;
  if (!getCaps) return true;

  try {
    const caps = await getCaps.call(PublicKeyCredential);
    return caps["extension:prf"] !== false;
  } catch {
    return true;
  }
}

function prfOutput(credential: PublicKeyCredential): TBytes | null {
  const result = (
    credential.getClientExtensionResults() as unknown as
      | IPrfExtensionOutputs
      | undefined
  )?.prf?.results?.first;
  return result ? new Uint8Array(result) : null;
}

async function assertPrf(
  credentialId: BufferSource,
  salt: TBytes,
  rpId: string,
): Promise<TBytes | null> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId,
      allowCredentials: [{ type: "public-key", id: credentialId }],
      userVerification: "required",
      extensions: {
        prf: { eval: { first: salt } },
      } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Passkey prompt was dismissed");
  return prfOutput(assertion);
}

export async function createPasskey(): Promise<IRegisteredPasskey> {
  const prfSalt = randomBytes(PRF_SALT_BYTES);
  const rpId = location.hostname;

  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { id: rpId, name: RP_NAME },
      user: { id: randomBytes(16), name: "device", displayName: RP_NAME },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      extensions: {
        prf: { eval: { first: prfSalt } },
      } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey creation was cancelled");

  const output =
    prfOutput(credential) ?? (await assertPrf(credential.rawId, prfSalt, rpId));

  if (!output) throw new Error("This authenticator does not support PRF");

  return {
    credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    prfSalt: bytesToBase64Url(prfSalt),
    rpId,
    prfOutput: output,
  };
}

export async function unlockPasskey(
  credentialId: string,
  prfSalt: string,
  rpId: string,
): Promise<TBytes> {
  const output = await assertPrf(
    base64UrlToBytes(credentialId),
    base64UrlToBytes(prfSalt),
    rpId,
  );
  if (!output) throw new Error("The passkey did not return a PRF result");
  return output;
}
