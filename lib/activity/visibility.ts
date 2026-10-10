export type ActivityVisibilityClass =
  | "PUBLIC"
  | "PRIVATE"
  | "CONFIDENTIAL"
  | "RESTRICTED";

export type ActivityEventForVisibility = {
  event_type: string;
  actor_id: string | null;
  visibility_class: string;
};

export type ActivityVisibilityContext = {
  viewerId: string;
  activityOwnerId: string;
  hasBlockingRelationship: boolean;
  referencedContentVisible: boolean;
};

/**
 * Only event types explicitly approved for user-facing activity
 * can pass this policy.
 *
 * The event's visibility class alone is never sufficient.
 */
const PUBLIC_ACTIVITY_EVENT_TYPES: ReadonlySet<string> =
  new Set([
    "post.created",
    "post.reaction.added",
    "comment.created",
    "repost.created",
  ]);

/**
 * These events are eligible only for the account owner's
 * personal activity history. They must never be exposed as
 * public profile activity.
 */
const PRIVATE_OWNER_ACTIVITY_EVENT_TYPES: ReadonlySet<string> =
  new Set([
    "follow.created",
    "follow.deleted",
  ]);

/**
 * Determines whether an event can appear in a user-facing
 * activity view.
 *
 * The caller must:
 * - Authenticate the viewer.
 * - Read events through the server-side event lookup.
 * - Confirm that the activity owner's profile is active.
 * - Check blocks in both directions.
 * - Verify referenced content is still available to the viewer.
 * - Return a safe presentation object, never raw event data.
 *
 * CONFIDENTIAL and RESTRICTED events are denied by default.
 * They require an explicitly approved access policy before
 * they can be exposed through any ordinary activity endpoint.
 */
export function canViewerSeeActivityEvent(
  event: ActivityEventForVisibility,
  context: ActivityVisibilityContext,
): boolean {
  if (
    !context.viewerId ||
    !context.activityOwnerId ||
    !event.actor_id ||
    event.actor_id !== context.activityOwnerId ||
    context.hasBlockingRelationship ||
    !context.referencedContentVisible
  ) {
    return false;
  }

  switch (event.visibility_class) {
    case "PUBLIC":
      return PUBLIC_ACTIVITY_EVENT_TYPES.has(
        event.event_type,
      );

    case "PRIVATE":
      return (
        context.viewerId === context.activityOwnerId &&
        PRIVATE_OWNER_ACTIVITY_EVENT_TYPES.has(
          event.event_type,
        )
      );

    case "CONFIDENTIAL":
    case "RESTRICTED":
    default:
      return false;
  }
}