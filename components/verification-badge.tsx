
type AccountType =
  | "personal"
  | "creator"
  | "business"
  | "organization"
  | "institution";

type VerificationKind =
  | "agore_official"
  | "official"
  | "paid";

type VerificationBadgeProps = {
  accountType: AccountType;
  kind: VerificationKind | null | undefined;
  size?: number;
};

const ACCOUNT_BADGES: Record<
  AccountType,
  {
    label: string;
    color: string;
  }
> = {
  personal: {
    label: "Personal",
    color: "#3157A4",
  },
  creator: {
    label: "Creator",
    color: "#178C8C",
  },
  business: {
    label: "Business",
    color: "#B86636",
  },
  organization: {
    label: "Organization",
    color: "#D4A72C",
  },
  institution: {
    label: "Institution",
    color: "#37734A",
  },
};

export default function VerificationBadge({
  accountType,
  kind,
  size = 19,
}: VerificationBadgeProps) {
  if (!kind) {
    return null;
  }

  const account =
    ACCOUNT_BADGES[accountType] ??
    ACCOUNT_BADGES.personal;

  // "official" is temporary compatibility for existing database records.
  // New Agoré-operated account grants must use "agore_official".
  const isAgoreOfficial =
    kind === "agore_official" ||
    kind === "official";

  const color = isAgoreOfficial
    ? "#6D28D9"
    : account.color;

  const checkColor =
    accountType === "organization" &&
    !isAgoreOfficial
      ? "#201B0B"
      : "#FFFFFF";

  const label = isAgoreOfficial
    ? "Agoré Official"
    : `${account.label} verified`;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center align-middle"
      style={{
        width: size,
        height: size,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        {accountType === "personal" ? (
          <circle
            cx="12"
            cy="12"
            r="10"
            fill={color}
          />
        ) : accountType === "creator" ? (
          <path
            d="M12 1.5 14.8 5.8 20 4.3 18.5 9.5 22.5 12 18.5 14.5 20 19.7 14.8 18.2 12 22.5 9.2 18.2 4 19.7 5.5 14.5 1.5 12 5.5 9.5 4 4.3 9.2 5.8Z"
            fill={color}
          />
        ) : accountType === "business" ? (
          <path
            d="M7 2.5H17L22 12 17 21.5H7L2 12Z"
            fill={color}
          />
        ) : accountType === "organization" ? (
          <path
            d="M7 2H17L22 7V17L17 22H7L2 17V7Z"
            fill={color}
          />
        ) : (
          <path
            d="M12 1.5 21 4.8V11.2C21 16.5 17.4 20 12 22.5 6.6 20 3 16.5 3 11.2V4.8Z"
            fill={color}
          />
        )}

        <path
          d="m7.3 12.1 3.1 3.1 6.5-6.6"
          stroke={checkColor}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
