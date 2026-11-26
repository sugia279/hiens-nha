export const reactions = ['heart', 'laugh', 'wow'] as const;
export type Reaction = (typeof reactions)[number];
export interface PostReactions {
  post_id: string;
  heart: number;
  laugh: number;
  wow: number;
  mine: Reaction | null;
}

export const reactionEmoji: Record<Reaction,string> = {heart:'❤️',laugh:'😊',wow:'😮'};
export interface GuestIdentity {display_name:string;chosen:boolean}
export interface SocialDisplay {display_name:string;avatar_url:string|null}
export interface ReactionDetails {items:(SocialDisplay & {reaction:Reaction})[];nextCursor:string|null}
