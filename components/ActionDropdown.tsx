"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import Image from "next/image";
import { Models } from "node-appwrite";
import { actionsDropdownItems } from "@/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  deleteFile,
  renameFile,
  updateFileUsers,
} from "@/lib/actions/file.actions";
import { useRouter } from "next/navigation";
import { FileDetails, ShareInput } from "@/components/ActionsModalContent";
import { fileDownloadUrl } from "@/lib/file-response";
import { fileBaseNameSchema, parseShareEmails } from "@/lib/validation";
import { useToast } from "@/hooks/use-toast";

const OWNER_ONLY_ACTIONS = ["rename", "share", "delete"];

const baseName = (file: Models.DefaultRow) =>
  file.extension && file.name.toLowerCase().endsWith(`.${file.extension}`)
    ? file.name.slice(0, -(file.extension.length + 1))
    : file.name;

const ActionDropdown = ({
  file,
  isOwner,
}: {
  file: Models.DefaultRow;
  isOwner: boolean;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [action, setAction] = useState<ActionType | null>(null);
  const [name, setName] = useState(baseName(file));
  const [isLoading, setIsLoading] = useState(false);
  const [shareInput, setShareInput] = useState("");
  const [sharedWith, setSharedWith] = useState<string[]>(file.users ?? []);
  const [formError, setFormError] = useState("");

  const items = actionsDropdownItems.filter(
    (item) => isOwner || !OWNER_ONLY_ACTIONS.includes(item.value),
  );

  const closeAllModals = () => {
    setIsModalOpen(false);
    setIsDropdownOpen(false);
    setAction(null);
    setName(baseName(file));
    setShareInput("");
    setFormError("");
  };

  const showError = (message: string) =>
    toast({
      description: <p className="body-2 text-white">{message}</p>,
      className: "error-toast",
    });

  const handleAction = async () => {
    if (!action || isLoading) return;
    setFormError("");

    let request: Promise<{ success: boolean; error?: string }>;

    if (action.value === "rename") {
      const parsed = fileBaseNameSchema.safeParse(name);
      if (!parsed.success) return setFormError(parsed.error.issues[0].message);
      if (parsed.data === baseName(file)) return closeAllModals();
      request = renameFile({ fileId: file.$id, name: parsed.data });
    } else if (action.value === "share") {
      const { emails, invalid } = parseShareEmails(shareInput);
      if (invalid.length > 0) {
        return setFormError(`Not a valid email: ${invalid.join(", ")}`);
      }
      if (emails.length === 0) return setFormError("Enter at least one email address");
      // Add to the existing recipients instead of replacing them.
      const merged = Array.from(new Set([...sharedWith, ...emails]));
      request = updateFileUsers({ fileId: file.$id, emails: merged }).then((r) => {
        if (r.success) setSharedWith(merged);
        return r;
      });
    } else if (action.value === "delete") {
      request = deleteFile({ fileId: file.$id });
    } else {
      return;
    }

    setIsLoading(true);
    try {
      const result = await request;
      if (result.success) {
        closeAllModals();
        router.refresh();
      } else {
        setFormError(result.error ?? "Something went wrong");
      }
    } catch {
      showError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveUser = async (email: string) => {
    const updated = sharedWith.filter((e) => e !== email);
    const result = await updateFileUsers({ fileId: file.$id, emails: updated });

    if (result.success) {
      setSharedWith(updated);
      router.refresh();
    } else {
      showError(result.error);
    }
  };

  const renderDialogContent = () => {
    if (!action) return null;

    const { value, label } = action;

    return (
      <DialogContent className="shad-dialog button">
        <DialogHeader className="flex flex-col gap-3">
          <DialogTitle className="text-center text-light-100">{label}</DialogTitle>
          <DialogDescription className="sr-only">
            {label} {file.name}
          </DialogDescription>
          {value === "rename" && (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={name}
                aria-label="New file name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAction()}
              />
              {file.extension && (
                <span className="body-2 text-light-200">.{file.extension}</span>
              )}
            </div>
          )}
          {value === "details" && <FileDetails file={file} />}
          {value === "share" && (
            <ShareInput
              file={file}
              sharedWith={sharedWith}
              value={shareInput}
              onInputChange={setShareInput}
              onRemove={handleRemoveUser}
            />
          )}
          {value === "delete" && (
            <p className="delete-confirmation">
              Are you sure you want to delete{` `}
              <span className="delete-file-name">{file.name}</span>?
            </p>
          )}
          {formError && (
            <p className="body-2 text-center text-error" role="alert">
              {formError}
            </p>
          )}
        </DialogHeader>
        {["rename", "delete", "share"].includes(value) && (
          <DialogFooter className="flex flex-col gap-3 md:flex-row">
            <Button onClick={closeAllModals} className="modal-cancel-button">
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              className="modal-submit-button"
              disabled={isLoading}
            >
              <p className="capitalize">{value}</p>
              {isLoading && (
                <Image
                  src="/assets/icons/loader.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="animate-spin"
                />
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    );
  };

  return (
    <Dialog
      open={isModalOpen}
      onOpenChange={(open) => (open ? setIsModalOpen(true) : closeAllModals())}
    >
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger
          className="shad-no-focus"
          aria-label={`Actions for ${file.name}`}
        >
          <Image src="/assets/icons/dots.svg" alt="" width={34} height={34} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="max-w-[200px] truncate">
            {file.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((actionItem) =>
            actionItem.value === "download" ? (
              <DropdownMenuItem
                key={actionItem.value}
                className="shad-dropdown-item"
                asChild
              >
                <a
                  href={fileDownloadUrl(file.$id)}
                  download={file.name}
                  className="flex items-center gap-2"
                >
                  <Image src={actionItem.icon} alt="" width={30} height={30} />
                  {actionItem.label}
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={actionItem.value}
                className="shad-dropdown-item"
                onClick={() => {
                  setAction(actionItem);
                  setIsModalOpen(true);
                }}
              >
                <div className="flex items-center gap-2">
                  <Image src={actionItem.icon} alt="" width={30} height={30} />
                  {actionItem.label}
                </div>
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {renderDialogContent()}
    </Dialog>
  );
};
export default ActionDropdown;
