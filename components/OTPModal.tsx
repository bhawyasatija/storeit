"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import React, { useEffect, useState } from "react";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { verifySecret, sendEmailOTP } from "@/lib/actions/user.actions";
import { useRouter } from "next/navigation";

const RESEND_COOLDOWN_SECONDS = 30;

const OtpModal = ({
  accountId,
  email,
  onClose,
}: {
  accountId: string;
  email: string;
  onClose?: () => void;
}) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const close = () => {
    setIsOpen(false);
    onClose?.();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (password.length !== 6 || isLoading) return;

    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await verifySecret({ accountId, password });

      if (result.ok) {
        router.replace("/");
        router.refresh();
        return; // keep the loader visible while navigating
      }

      setError(result.error);
      setPassword("");
    } catch {
      setError("Could not verify the code. Please try again.");
    }

    setIsLoading(false);
  };

  const handleResendOtp = async () => {
    setError("");
    setNotice("");
    const result = await sendEmailOTP({ email });
    if (result.ok) {
      setNotice("A new code has been sent.");
      setPassword("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setError(result.error ?? "Could not send a new code.");
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : close())}>
      <AlertDialogContent className="shad-alert-dialog">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <AlertDialogHeader className="relative flex justify-center">
            <AlertDialogTitle className="h2 text-center">
              Enter Your OTP
              <button
                type="button"
                onClick={close}
                className="otp-close-button"
                aria-label="Close"
              >
                <Image src="/assets/icons/close-dark.svg" alt="" width={20} height={20} />
              </button>
            </AlertDialogTitle>
            <AlertDialogDescription className="subtitle-2 text-center text-light-100">
              We&apos;ve sent a code to{" "}
              <span className="pl-1 text-brand">{email}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <InputOTP
            maxLength={6}
            value={password}
            onChange={(value) => setPassword(value.replace(/[^A-Za-z0-9]/g, ""))}
            pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-label="One-time code"
          >
            <InputOTPGroup className="shad-otp">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="shad-otp-slot" />
              ))}
            </InputOTPGroup>
          </InputOTP>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="body-2 text-center text-light-100" role="status">
              {notice}
            </p>
          )}

          <AlertDialogFooter>
            <div className="flex w-full flex-col gap-4">
              <Button
                type="submit"
                className="shad-submit-btn h-12"
                disabled={password.length !== 6 || isLoading}
              >
                Submit
                {isLoading && (
                  <Image
                    src="/assets/icons/loader.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="ml-2 animate-spin"
                  />
                )}
              </Button>

              <div className="subtitle-2 mt-2 text-center text-light-100">
                Didn&apos;t get a code?
                <Button
                  type="button"
                  variant="link"
                  className="pl-1 text-brand"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Click to resend"}
                </Button>
              </div>
            </div>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default OtpModal;
