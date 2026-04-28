type FileSlotElements = {
  list: HTMLOListElement;
  input: HTMLInputElement;
  zone: HTMLButtonElement;
  submit: HTMLButtonElement;
  clear: HTMLButtonElement;
  progress: HTMLProgressElement;
  status: HTMLParagraphElement;
  error: HTMLParagraphElement;
};

const MAX_FILES = 2;

const elements = getElements();
let selectedFiles: File[] = [];

wireEvents(elements);
render();

function getElements(): FileSlotElements {
  const list = must<HTMLOListElement>("file-list");
  const input = must<HTMLInputElement>("file-input");
  const zone = must<HTMLButtonElement>("drop-zone");
  const submit = must<HTMLButtonElement>("submit-button");
  const clear = must<HTMLButtonElement>("clear-button");
  const progress = must<HTMLProgressElement>("progress-bar");
  const status = must<HTMLParagraphElement>("status-text");
  const error = must<HTMLParagraphElement>("error-text");

  return { list, input, zone, submit, clear, progress, status, error };
}

function wireEvents(ui: FileSlotElements): void {
  ui.zone.addEventListener("click", () => {
    ui.input.click();
  });

  ui.input.addEventListener("change", () => {
    applyFiles(ui.input.files);
  });

  for (const eventName of ["dragenter", "dragover"]) {
    ui.zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      ui.zone.classList.add("is-active");
    });
  }

  for (const eventName of ["dragleave", "dragend", "drop"]) {
    ui.zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName !== "drop") {
        ui.zone.classList.remove("is-active");
      }
    });
  }

  ui.zone.addEventListener("drop", (event) => {
    ui.zone.classList.remove("is-active");

    const files = event.dataTransfer?.files ?? null;
    applyFiles(files);
  });

  const form = must<HTMLFormElement>("upload-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void uploadFiles();
  });

  ui.clear.addEventListener("click", () => {
    selectedFiles = [];
    ui.input.value = "";
    resetStatus();
    render();
  });
}

function applyFiles(fileList: FileList | null): void {
  if (!fileList) {
    return;
  }

  const files = Array.from(fileList).filter((file) => isPdf(file));

  if (files.length !== MAX_FILES) {
    selectedFiles = [];
    elements.input.value = "";
    setError("Choose exactly two PDF files.");
    render();
    return;
  }

  selectedFiles = files;
  syncInputFiles(files);
  resetStatus();
  render();
}

function render(): void {
  elements.list.replaceChildren(...renderSlots());
  const ready = selectedFiles.length === MAX_FILES;
  elements.submit.disabled = !ready;
  elements.clear.disabled = selectedFiles.length === 0;
}

function renderSlots(): HTMLLIElement[] {
  return Array.from({ length: MAX_FILES }, (_, index) => {
    const item = document.createElement("li");
    item.className = "file-slot";

    const file = selectedFiles[index];
    if (!file) {
      item.classList.add("is-empty");
      item.textContent = `File ${index + 1}`;
      return item;
    }

    const title = document.createElement("span");
    title.className = "file-name";
    title.textContent = file.name;

    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.textContent = formatFileSize(file.size);

    item.append(title, meta);
    return item;
  });
}

async function uploadFiles(): Promise<void> {
  if (selectedFiles.length !== MAX_FILES) {
    setError("Choose exactly two PDF files.");
    render();
    return;
  }

  setLoading(true);
  resetStatus();
  elements.status.textContent = "Uploading files...";

  try {
    const response = await submitJoinRequest(selectedFiles);
    const filename = getFilename(response.disposition) ?? "merged.pdf";
    downloadBlob(response.data, filename);
    elements.status.textContent = "Merged PDF downloaded.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    setError(message);
  } finally {
    setLoading(false);
  }
}

function submitJoinRequest(files: File[]): Promise<{ data: Blob; disposition: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    for (const file of files) {
      formData.append("files", file, file.name);
    }

    xhr.open("POST", "/join");
    xhr.responseType = "blob";

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      elements.progress.hidden = false;
      elements.progress.value = (event.loaded / event.total) * 100;
      elements.status.textContent = `Uploading files... ${Math.round(elements.progress.value)}%`;
    });

    xhr.addEventListener("load", async () => {
      const disposition = xhr.getResponseHeader("Content-Disposition");

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ data: xhr.response, disposition });
        return;
      }

      reject(new Error(await readBlobText(xhr.response)));
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error while uploading files."));
    });

    xhr.send(formData);
  });
}

function setLoading(isLoading: boolean): void {
  elements.submit.disabled = isLoading || selectedFiles.length !== MAX_FILES;
  elements.clear.disabled = isLoading || selectedFiles.length === 0;
  elements.zone.disabled = isLoading;

  if (!isLoading) {
    elements.progress.hidden = true;
    elements.progress.value = 0;
  }
}

function resetStatus(): void {
  elements.status.textContent = "";
  elements.error.textContent = "";
  elements.error.classList.remove("has-error");
  elements.progress.hidden = true;
  elements.progress.value = 0;
}

function setError(message: string): void {
  elements.error.textContent = message;
  elements.error.classList.add("has-error");
}

function syncInputFiles(files: File[]): void {
  const dataTransfer = new DataTransfer();

  for (const file of files) {
    dataTransfer.items.add(file);
  }

  elements.input.files = dataTransfer.files;
}

function getFilename(disposition: string | null): string | null {
  if (!disposition) {
    return null;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = disposition.match(/filename="?([^"]+)"?/i);
  return asciiMatch?.[1] ?? null;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

async function readBlobText(blob: Blob): Promise<string> {
  const text = await blob.text();
  return text || "Upload failed.";
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${id}`);
  }

  return element as T;
}
