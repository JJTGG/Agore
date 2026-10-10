export type Theme =
  | "system"
  | "light"
  | "dark";

export type MessageAudience =
  | "everyone"
  | "followers";

export type ActivityVisibility =
  | "public"
  | "private"
  | "confidential";

export type ProfileSummary = {
  display_name: string;
  username: string;
};

export type UserSettings = {
  user_id: string;
  theme: Theme;
  allow_messages_from: MessageAudience;
  show_activity_status: boolean;
};

export type NotificationPreferences = {
  user_id: string;
  follows: boolean;
  reactions: boolean;
  comments: boolean;
  reposts: boolean;
  messages: boolean;
  group_activity: boolean;
};

export type UserSettingKey =
  Exclude<keyof UserSettings, "user_id">;

export type UpdateUserSetting = <
  K extends UserSettingKey,
>(
  key: K,
  value: UserSettings[K],
) => void;

export type NotificationPreferenceKey =
  Exclude<
    keyof NotificationPreferences,
    "user_id"
  >;

export type UpdateNotificationPreference = (
  key: NotificationPreferenceKey,
  value: boolean,
) => void;