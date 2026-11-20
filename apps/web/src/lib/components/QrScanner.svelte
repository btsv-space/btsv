<script lang="ts">
  import jsQR from "jsqr";

  let { onresult }: { onresult: (text: string) => void } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let error = $state("");

  $effect(() => {
    const element = video;
    if (!element) return;

    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      error = "This browser cannot access the camera.";
      return;
    }

    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;

      if (
        element.readyState >= 2 &&
        element.videoWidth &&
        element.videoHeight
      ) {
        canvas.width = element.videoWidth;
        canvas.height = element.videoHeight;
        context?.drawImage(element, 0, 0, canvas.width, canvas.height);

        const image = context?.getImageData(0, 0, canvas.width, canvas.height);
        if (image) {
          const found = jsQR(image.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });
          if (found?.data) {
            onresult(found.data);
            return; // stop scanning; the parent navigates or reports an error
          }
        }
      }

      frame = requestAnimationFrame(tick);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        element.srcObject = stream;
        await element.play();
        tick();
      } catch (err) {
        error =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it for this app and try again."
            : "Could not start the camera.";
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
    };
  });
</script>

<div
  class="relative aspect-square w-full overflow-hidden rounded-md border border-input bg-black"
>
  <video
    bind:this={video}
    class="h-full w-full object-cover"
    muted
    playsinline
    autoplay
  ></video>

  {#if error}
    <p
      class="absolute inset-0 m-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white"
    >
      {error}
    </p>
  {/if}
</div>
