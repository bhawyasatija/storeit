"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { cn, convertFileSize, getFileType } from "@/lib/utils";
import Image from "next/image";
import Thumbnail from "@/components/Thumbnail";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { validateUploadFile } from "@/lib/validation";

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  progress: number; // 0-100, from real upload progress events
  xhr?: XMLHttpRequest;
}

const uploadWithProgress = (
  file: File,
  onProgress: (percent: number) => void,
  onStart: (xhr: XMLHttpRequest) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("file", file);

    xhr.open("POST", "/api/files");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const message =
        (xhr.response && (xhr.response as { error?: string }).error) ||
        `Upload failed (${xhr.status})`;
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    onStart(xhr);
    xhr.send(body);
  });

let counter = 0;
const nextId = () => `upload-${Date.now()}-${counter++}`;

const FileUploader = ({ className }: FileUploaderProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  // Release object URLs created for image previews.
  useEffect(
    () => () => uploadsRef.current.forEach((u) => URL.revokeObjectURL(u.previewUrl)),
    [],
  );

  const update = (id: string, patch: Partial<UploadItem>) =>
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const remove = (id: string) =>
    setUploads((prev) => {
      const item = prev.find((u) => u.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((u) => u.id !== id);
    });

  const showError = useCallback(
    (fileName: string, message: string) =>
      toast({
        description: (
          <p className="body-2 text-white">
            <span className="font-semibold">{fileName}</span>: {message}
          </p>
        ),
        className: "error-toast",
      }),
    [toast],
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const valid: UploadItem[] = [];

      for (const file of acceptedFiles) {
        const error = validateUploadFile(file);
        if (error) {
          showError(file.name, error);
          continue;
        }
        valid.push({
          id: nextId(),
          file,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
        });
      }

      if (valid.length === 0) return;
      setUploads((prev) => [...prev, ...valid]);

      const results = await Promise.allSettled(
        valid.map((item) =>
          uploadWithProgress(
            item.file,
            (progress) => update(item.id, { progress }),
            (xhr) => update(item.id, { xhr }),
          )
            .then(() => remove(item.id))
            .catch((error: Error) => {
              remove(item.id);
              if (error.name !== "AbortError") showError(item.file.name, error.message);
              throw error;
            }),
        ),
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      if (succeeded > 0) {
        toast({
          description: (
            <p className="body-2">
              Uploaded {succeeded} file{succeeded > 1 ? "s" : ""}
            </p>
          ),
        });
        router.refresh();
      }
    },
    [router, showError, toast],
  );

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleCancel = (e: React.MouseEvent, item: UploadItem) => {
    e.stopPropagation();
    if (item.xhr) item.xhr.abort();
    else remove(item.id);
  };

  return (
    <div {...getRootProps()} className="cursor-pointer">
      <input {...getInputProps()} aria-label="Upload files" data-testid="file-input" />
      <Button type="button" className={cn("uploader-button", className)}>
        <Image src="/assets/icons/upload.svg" alt="" width={24} height={24} />{" "}
        <p>Upload</p>
      </Button>
      {uploads.length > 0 && (
        <ul className="uploader-preview-list" aria-live="polite">
          <h4 className="h4 text-light-100">Uploading</h4>

          {uploads.map((item) => {
            const { type, extension } = getFileType(item.file.name);

            return (
              <li key={item.id} className="uploader-preview-item">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Thumbnail type={type} extension={extension} url={item.previewUrl} />

                  <div className="preview-item-name min-w-0 flex-1">
                    <p className="truncate">{item.file.name}</p>
                    <div
                      className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-light-300"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.progress}
                      aria-label={`Uploading ${item.file.name}`}
                    >
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <p className="caption mt-1 text-light-200">
                      {item.progress < 100
                        ? `${item.progress}% of ${convertFileSize(item.file.size)}`
                        : "Processing…"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleCancel(e, item)}
                  aria-label={`Cancel upload of ${item.file.name}`}
                >
                  <Image src="/assets/icons/remove.svg" width={24} height={24} alt="" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FileUploader;
