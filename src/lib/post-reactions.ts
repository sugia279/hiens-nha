export const reactions = ['heart', 'laugh', 'wow'] as const;
export type Reaction = (typeof reactions)[number];
export interface PostReactions {
  post_id: string;
  heart: number;
  laugh: number;
  wow: number;
  mine: Reaction | null;
}
