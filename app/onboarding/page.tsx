"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export default function OnboardingPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          username: normalizeUsername(username),
          bio,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? "Unable to complete your profile.",
        );
      }

      router.replace("/home");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <section className="w-full">
          <div className="mb-8">
            <p className="text-xl font-semibold tracking-[-0.03em]">
              Agoré
            </p>

            <h1 className="mt-8 text-4xl font-semibold tracking-[-0.045em]">
              Make your profile.
            </h1>

            <p className="mt-3 leading-6 text-[var(--muted)]">
              Choose how people will know you around Agoré.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Display name
              </span>
              <input
                required
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                autoComplete="name"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Username
              </span>
              <input
                required
                minLength={3}
                maxLength={24}
                value={username}
                onChange={(event) =>
                  setUsername(normalizeUsername(event.target.value))
                }
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                autoComplete="username"
                spellCheck={false}
              />
              <span className="mt-2 block text-xs text-[var(--muted)]">
                3–24 characters: letters, numbers, and underscores.
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Bio
              </span>
              <textarea
                maxLength={160}
                rows={4}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                placeholder="Tell people a little about yourself."
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[var(--accent)] px-5 py-3 font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving profile..." : "Continue"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}