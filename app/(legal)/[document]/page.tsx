import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  policyDocuments,
  type PolicyDocument,
} from "@/components/legal/policies";

export function generateStaticParams() {
  return Object.keys(policyDocuments).map((document) => ({
    document,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const policy = policyDocuments[document];

  if (!policy) {
    return {
      title: "Page not found | Agoré",
    };
  }

  return {
    title: `${policy.title} | Agoré`,
    description: policy.introduction,
  };
}

function PolicyContent({
  policy,
  lastUpdated,
}: {
  policy: PolicyDocument;
  lastUpdated: string;
}) {
  return (
    <article>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
        {policy.label}
      </p>

      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        {policy.title}
      </h1>

      <p className="mt-4 text-sm text-[var(--muted)]">
        Last updated: {lastUpdated}
      </p>

      <p className="mt-7 max-w-3xl text-base leading-7 text-[var(--muted-strong)]">
        {policy.introduction}
      </p>

      <div className="mt-10 space-y-9">
        {policy.sections.map((section) => (
          <section
            key={section.heading}
            className="border-t border-[var(--border)] pt-6"
          >
            <h2 className="text-xl font-semibold tracking-tight">
              {section.heading}
            </h2>

            {section.paragraphs?.map((paragraph, index) => (
              <p
                key={`${section.heading}-${index}`}
                className="mt-3 text-sm leading-7 text-[var(--muted-strong)]"
              >
                {paragraph}
              </p>
            ))}

            {section.bullets && (
              <ul className="mt-4 list-disc space-y-2 pl-6 text-sm leading-7 text-[var(--muted-strong)]">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-semibold">Need help?</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Contact Agoré Support at{" "}
          <a
            href="mailto:agore.support@gmail.com"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            agore.support@gmail.com
          </a>
          .
        </p>
      </div>
    </article>
  );
}

export default async function PolicyDocumentPage({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  const policy = policyDocuments[document];

  if (!policy) {
    notFound();
  }

  const lastUpdated =
    document === "privacy" ? "26 October 2026" : "25 October 2026";

  return <PolicyContent policy={policy} lastUpdated={lastUpdated} />;
}