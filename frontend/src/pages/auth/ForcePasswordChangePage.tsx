import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { extractErrorMessage } from "../../lib/errors";

const schema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters"),
    confirmPassword: z.string().min(10, "Use at least 10 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ForcePasswordChangePage() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await changePassword(values.password);
      navigate("/", { replace: true });
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to set your new password. Please try again."));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="card w-full max-w-md p-8"
      >
        <h1 className="text-2xl font-semibold">Create a new password</h1>
        <p className="mt-2 text-sm text-gray-400">
          Your temporary password is no longer valid. Choose a strong password
          to continue.
        </p>
        {serverError ? (
          <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{serverError}</p>
        ) : null}
        <label className="mt-5 block text-sm font-medium">New password</label>
        <input
          type="password"
          {...register("password")}
          className="mt-2 w-full rounded-2xl border border-gray-200 px-3 py-2"
        />
        {errors.password ? (
          <p className="mt-2 text-xs text-danger">{errors.password.message}</p>
        ) : null}
        <label className="mt-4 block text-sm font-medium">
          Confirm password
        </label>
        <input
          type="password"
          {...register("confirmPassword")}
          className="mt-2 w-full rounded-2xl border border-gray-200 px-3 py-2"
        />
        {errors.confirmPassword ? (
          <p className="mt-2 text-xs text-danger">
            {errors.confirmPassword.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-2xl bg-primary px-4 py-2.5 font-medium text-white"
        >
          {isSubmitting ? "Updating…" : "Set password"}
        </button>
      </form>
    </div>
  );
}
