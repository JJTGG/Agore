"use client";

import type { ReactNode } from "react";

const OPEN_SETTINGS_EVENT = "agore-open-analytics-settings";

type AnalyticsSettingsLinkProps = {
  children?: ReactNode;
  className?: string;
};

export default function AnalyticsSettingsLink({
  children = "Privacy & analytics settings",
  className = "hover:underline",
}: AnalyticsSettingsLinkProps) {
  function openSettings() {
    window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
  }

  return (
    <button
      type="button"
      onClick={openSettings}
      aria-controls="analytics-privacy-controls"
      className={`cursor-pointer text-left ${className}`}
    >
      {children}
    </button>
  );
}